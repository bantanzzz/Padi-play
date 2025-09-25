// Firebase v11+ (modular) via CDN
// Replace the firebaseConfig object with your own project credentials.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, orderBy, doc, setDoc, getDoc, updateDoc, onSnapshot, Timestamp, increment } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// --- Firebase Setup (placeholder: replace with your config) ---
const firebaseConfig = {
  apiKey: "AIzaSyAzWLtsBXYCKfyvloc5BHDgv6nJsM7on7A",
  authDomain: "padi-play.firebaseapp.com",
  databaseURL: "https://padi-play-default-rtdb.firebaseio.com",
  projectId: "padi-play",
  storageBucket: "padi-play.firebasestorage.app",
  messagingSenderId: "166231412907",
  appId: "1:166231412907:web:9207db235dbb176c66a7ee",
  measurementId: "G-VNVSZK7F1M"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// --- DOM Elements ---
const letterDisplay = document.getElementById("letterDisplay");
const timerDisplay = document.getElementById("timerDisplay");
const startRoundBtn = document.getElementById("startRoundBtn");
const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCode");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomStatus = document.getElementById("roomStatus");
const entriesHint = document.getElementById("entriesHint");
const form = document.getElementById("gameForm");
const nameInput = document.getElementById("nameInput");
const placeInput = document.getElementById("placeInput");
const animalInput = document.getElementById("animalInput");
const thingInput = document.getElementById("thingInput");
const formError = document.getElementById("formError");
const entriesList = document.getElementById("entriesList");
const leaderboardList = document.getElementById("leaderboardList");
const roundDurationSelect = document.getElementById("roundDuration");
const profileNameInput = document.getElementById("profileName");
const profileEmojiInput = document.getElementById("profileEmoji");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const profileStatus = document.getElementById("profileStatus");
const autoLetterBtn = document.getElementById("autoLetterBtn");

// --- Helpers ---
function getRandomLetter() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const index = Math.floor(Math.random() * alphabet.length);
  return alphabet[index];
}

function clearForm() {
  nameInput.value = "";
  placeInput.value = "";
  animalInput.value = "";
  thingInput.value = "";
}

function validateForm() {
  const hasLetter = letterDisplay.textContent && letterDisplay.textContent !== "-";
  const allFilled = nameInput.value.trim() && placeInput.value.trim() && animalInput.value.trim() && thingInput.value.trim();
  return Boolean(hasLetter && allFilled);
}

function renderEntries(items) {
  entriesList.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "py-4 text-sm text-gray-500";
    li.textContent = "No entries yet.";
    entriesList.appendChild(li);
    return;
  }

  items.forEach((doc) => {
    const data = doc.data();
    const timestamp = data.createdAt?.toDate ? data.createdAt.toDate() : null;
    const when = timestamp ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "";

    const li = document.createElement("li");
    li.className = "py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1";
    li.innerHTML = `
      <div>
        <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold mr-2">${data.letter || "-"}</span>
        <span class="font-medium">Name:</span> ${data.name}
        <span class="ml-3 font-medium">Place:</span> ${data.place}
        <span class="ml-3 font-medium">Animal:</span> ${data.animal}
        <span class="ml-3 font-medium">Thing:</span> ${data.thing}
      </div>
      <div class="text-xs text-purple-500">${when}</div>
    `;
    entriesList.appendChild(li);
  });
}

// --- Multiplayer state ---
let currentRoomId = null;
let clientId = localStorage.getItem("npats_client_id") || (() => {
  const id = Math.random().toString(36).slice(2, 10);
  localStorage.setItem("npats_client_id", id);
  return id;
})();
let entriesUnsub = null;
let roomUnsub = null;
let timerIntervalId = null;
let roundActive = false;

function setRoomStatus(text) {
  roomStatus.textContent = text;
}

function setTimerText(mmss) {
  timerDisplay.textContent = mmss;
}

function stopTimer() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function startCountdown(endMillis) {
  stopTimer();
  const tick = () => {
    const remaining = Math.max(0, endMillis - Date.now());
    const totalSeconds = Math.floor(remaining / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    setTimerText(`${minutes}:${seconds}`);
    if (remaining <= 0) {
      stopTimer();
    }
  };
  tick();
  timerIntervalId = setInterval(tick, 250);
}

function detachListeners() {
  if (entriesUnsub) { entriesUnsub(); entriesUnsub = null; }
  if (roomUnsub) { roomUnsub(); roomUnsub = null; }
  stopTimer();
}

function subscribeToRoom(roomId) {
  detachListeners();
  const roomRef = doc(db, "rooms", roomId);
  roomUnsub = onSnapshot(roomRef, (snap) => {
    if (!snap.exists()) {
      roundActive = false;
      letterDisplay.textContent = "-";
      setTimerText("--:--");
      return;
    }
    const data = snap.data();
    letterDisplay.textContent = data.currentLetter || "-";
    roundActive = Boolean(data.active);
    const end = data.roundEndsAt instanceof Timestamp ? data.roundEndsAt.toMillis() : null;
    if (roundActive && end) {
      startCountdown(end);
    } else {
      stopTimer();
      setTimerText("--:--");
    }
  });

  const entriesRef = collection(db, "rooms", roomId, "entries");
  const q = query(entriesRef, orderBy("createdAt", "desc"));
  entriesUnsub = onSnapshot(q, (snap) => {
    renderEntries(snap.docs);
    if (entriesHint) entriesHint.textContent = `Room ${roomId}`;
    renderLeaderboard(snap.docs);
  });
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid ambiguous chars
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function createRoom() {
  const baseName = (profileNameInput?.value || playerNameInput.value || "Player").trim();
  const playerName = baseName || "Player";
  const roomId = (roomCodeInput.value || generateRoomCode()).toUpperCase();
  const roomRef = doc(db, "rooms", roomId);
  await setDoc(roomRef, {
    hostName: playerName,
    active: false,
    currentLetter: null,
    roundEndsAt: null,
    createdAt: serverTimestamp(),
  }, { merge: true });
  currentRoomId = roomId;
  setRoomStatus(`In room ${roomId} (host: ${playerName})`);
  subscribeToRoom(roomId);
  await setDoc(doc(db, "rooms", roomId, "players", clientId), {
    name: playerName,
    emoji: profileEmojiInput?.value || "",
    joinedAt: serverTimestamp(),
    score: 0,
  }, { merge: true });
}

async function joinRoom() {
  const baseName = (profileNameInput?.value || playerNameInput.value || "Player").trim();
  const playerName = baseName || "Player";
  const roomId = (roomCodeInput.value || "").toUpperCase();
  if (!roomId) {
    alert("Enter a room code to join.");
    return;
  }
  const roomRef = doc(db, "rooms", roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) {
    alert("Room not found");
    return;
  }
  currentRoomId = roomId;
  setRoomStatus(`In room ${roomId} (player: ${playerName})`);
  subscribeToRoom(roomId);
  await setDoc(doc(db, "rooms", roomId, "players", clientId), {
    name: playerName,
    emoji: profileEmojiInput?.value || "",
    joinedAt: serverTimestamp(),
    score: 0,
  }, { merge: true });
}

async function startRound() {
  if (!currentRoomId) {
    alert("Create or join a room first.");
    return;
  }
  const durationSeconds = Number(roundDurationSelect?.value || 60);
  const endMillis = Date.now() + durationSeconds * 1000;
  const roomRef = doc(db, "rooms", currentRoomId);
  await updateDoc(roomRef, {
    currentLetter: getRandomLetter(),
    active: true,
    roundEndsAt: Timestamp.fromMillis(endMillis),
    roundStartsAt: Timestamp.fromMillis(Date.now()),
    roundDurationSeconds: durationSeconds,
  });
}

// --- Events ---
createRoomBtn.addEventListener("click", (e) => {
  e.preventDefault();
  createRoom().catch((err) => console.error(err));
});

joinRoomBtn.addEventListener("click", (e) => {
  e.preventDefault();
  joinRoom().catch((err) => console.error(err));
});

startRoundBtn.addEventListener("click", (e) => {
  e.preventDefault();
  startRound().catch((err) => console.error(err));
});

// Auto-generate a new random letter without starting a new round (host utility)
if (autoLetterBtn) {
  autoLetterBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!currentRoomId) {
      alert("Create or join a room first.");
      return;
    }
    try {
      await updateDoc(doc(db, "rooms", currentRoomId), { currentLetter: getRandomLetter() });
    } catch (err) {
      console.error("Failed to set letter", err);
    }
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm()) {
    formError.classList.remove("hidden");
    return;
  }
  formError.classList.add("hidden");

  if (!currentRoomId) {
    formError.textContent = "Join a room before submitting.";
    formError.classList.remove("hidden");
    return;
  }
  if (!roundActive) {
    formError.textContent = "Round not active. Ask host to start.";
    formError.classList.remove("hidden");
    return;
  }

  const payload = {
    letter: letterDisplay.textContent,
    name: nameInput.value.trim(),
    place: placeInput.value.trim(),
    animal: animalInput.value.trim(),
    thing: thingInput.value.trim(),
    playerId: clientId,
    createdAt: serverTimestamp(),
  };

  try {
    // Compute time-based points from room round timing
    const roomSnap = await getDoc(doc(db, "rooms", currentRoomId));
    const roomData = roomSnap.data() || {};
    const endMs = roomData.roundEndsAt instanceof Timestamp ? roomData.roundEndsAt.toMillis() : Date.now();
    const duration = Number(roomData.roundDurationSeconds || 60);
    const remainingSec = Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
    const points = Math.max(1, Math.min(duration, remainingSec));
    payload.points = points;

    // Add roundId for uniqueness
    const roundId = roomData.roundStartsAt ? roomData.roundStartsAt.toMillis().toString() : null;
    if (!roundId) {
      formError.textContent = "Round not properly started.";
      formError.classList.remove("hidden");
      return;
    }
    payload.roundId = roundId;

    // Use setDoc with unique ID to prevent duplicates
    const entryId = `${payload.playerId}_${payload.roundId}`;
    await setDoc(doc(db, "rooms", currentRoomId, "entries", entryId), payload);
    // Atomic score increment by points
    await updateDoc(doc(db, "rooms", currentRoomId, "players", clientId), { score: increment(points) })
      .catch(async () => {
        await setDoc(doc(db, "rooms", currentRoomId, "players", clientId), { score: points }, { merge: true });
      });
    alert("Submitted successfully!");
    clearForm();
  } catch (err) {
    console.error("Failed to submit", err);
    alert("Failed to submit. Check console for details.");
  }
});

// Initial state
setRoomStatus("Not in a room");
setTimerText("--:--");

// --- Leaderboard ---
function renderLeaderboard(entryDocs) {
  if (!leaderboardList) return;
  // Compute scores from entries' points as a fallback display
  const scores = new Map();
  entryDocs.forEach((d) => {
    const data = d.data();
    const pid = data.playerId || "?";
    const name = data.name || "Player";
    const earned = Number(data.points || 0) || 0;
    const current = scores.get(pid) || { name, score: 0 };
    current.name = name;
    current.score += earned;
    scores.set(pid, current);
  });
  const arr = Array.from(scores.values()).sort((a, b) => b.score - a.score);
  leaderboardList.innerHTML = "";
  if (!arr.length) {
    const li = document.createElement("li");
    li.className = "py-4 text-sm text-gray-500";
    li.textContent = "No scores yet.";
    leaderboardList.appendChild(li);
    return;
  }
  arr.forEach(({ name, score }) => {
    const li = document.createElement("li");
    li.className = "py-3 flex items-center justify-between";
    li.innerHTML = `<span class="font-medium">${name}</span><span class="text-purple-700 font-semibold">${score}</span>`;
    leaderboardList.appendChild(li);
  });
}

// --- Profile ---
async function loadProfile() {
  try {
    // 1) Use local cache immediately for instant UX
    const cached = localStorage.getItem("npats_profile");
    if (cached) {
      const p = JSON.parse(cached);
      if (profileNameInput && p.name) profileNameInput.value = p.name;
      if (profileEmojiInput && p.emoji) profileEmojiInput.value = p.emoji;
      if (playerNameInput && p.name) playerNameInput.value = p.name;
    }

    // 2) Refresh from Firestore (authoritative)
    const userRef = doc(db, "users", clientId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      if (profileNameInput && data.name) profileNameInput.value = data.name;
      if (profileEmojiInput && data.emoji) profileEmojiInput.value = data.emoji;
      if (playerNameInput && data.name) playerNameInput.value = data.name;
      // Update local cache
      localStorage.setItem("npats_profile", JSON.stringify({ name: data.name || "", emoji: data.emoji || "" }));
    }
  } catch (e) {
    console.error("Failed to load profile", e);
  }
}

async function saveProfile() {
  try {
    const name = (profileNameInput?.value || "").trim();
    const emoji = (profileEmojiInput?.value || "").trim();
    await setDoc(doc(db, "users", clientId), {
      name,
      emoji,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    // Save locally for instant load next visit
    localStorage.setItem("npats_profile", JSON.stringify({ name, emoji }));
    if (playerNameInput && name) playerNameInput.value = name;
    if (profileStatus) {
      profileStatus.textContent = "Saved!";
      setTimeout(() => (profileStatus.textContent = ""), 1500);
    }
    // If in a room, sync to players doc
    if (currentRoomId) {
      await setDoc(doc(db, "rooms", currentRoomId, "players", clientId), {
        name: name || "Player",
        emoji: emoji || "",
      }, { merge: true });
    }
  } catch (e) {
    console.error("Failed to save profile", e);
    if (profileStatus) profileStatus.textContent = "Save failed";
  }
}

if (saveProfileBtn) {
  saveProfileBtn.addEventListener("click", (e) => {
    e.preventDefault();
    saveProfile();
  });
}

loadProfile();


