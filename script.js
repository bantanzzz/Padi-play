// Firebase v11+ (modular) via CDN
// Replace the firebaseConfig object with your own project credentials.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, orderBy, doc, setDoc, getDoc, updateDoc, onSnapshot, Timestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

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
// Removed playerNameInput - now using profile only
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
const artistInput = document.getElementById("artistInput");
const formError = document.getElementById("formError");
const entriesList = document.getElementById("entriesList");
const leaderboardList = document.getElementById("leaderboardList");
const roomMembersList = document.getElementById("roomMembersList");
const membersCount = document.getElementById("membersCount");
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
  artistInput.value = "";
}

function validateForm() {
  const hasLetter = letterDisplay.textContent && letterDisplay.textContent !== "-";
  const allFilled = nameInput.value.trim() && placeInput.value.trim() && animalInput.value.trim() && thingInput.value.trim() && artistInput.value.trim();
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
      <div class="bg-white rounded-lg p-4 shadow-sm border border-emerald-200">
        <div class="flex items-center gap-3 mb-2">
          <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">${data.letter || "-"}</span>
          <div class="flex-1">
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div><span class="font-semibold text-emerald-700">Name:</span> ${data.name}</div>
              <div><span class="font-semibold text-emerald-700">Place:</span> ${data.place}</div>
              <div><span class="font-semibold text-emerald-700">Animal:</span> ${data.animal}</div>
              <div><span class="font-semibold text-emerald-700">Thing:</span> ${data.thing}</div>
              <div class="col-span-2"><span class="font-semibold text-emerald-700">Artist:</span> ${data.artist || 'N/A'}</div>
            </div>
          </div>
        </div>
        <div class="text-xs text-emerald-600 font-medium">${when}</div>
      </div>
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

  // Listen to room members
  const playersRef = collection(db, "rooms", roomId, "players");
  const playersQuery = query(playersRef, orderBy("joinedAt", "asc"));
  const playersUnsub = onSnapshot(playersQuery, (snap) => {
    renderRoomMembers(snap.docs);
  });
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // avoid ambiguous chars
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function createRoom() {
  const playerName = (profileNameInput?.value || "Player").trim();
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
  const playerName = (profileNameInput?.value || "Player").trim();
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
    artist: artistInput.value.trim(),
    playerId: clientId,
    createdAt: serverTimestamp(),
  };

  try {
    await addDoc(collection(db, "rooms", currentRoomId, "entries"), payload);
    // Simple scoring: +1 per valid submission
    await updateDoc(doc(db, "rooms", currentRoomId, "players", clientId), {
      score: (await getDoc(doc(db, "rooms", currentRoomId, "players", clientId))).data()?.score + 1 || 1,
    }).catch(async () => {
      // Fallback if doc missing
      await setDoc(doc(db, "rooms", currentRoomId, "players", clientId), { score: 1 }, { merge: true });
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
  arr.forEach(({ name, score }, index) => {
    const li = document.createElement("li");
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "";
    li.className = "bg-white rounded-lg p-4 shadow-sm border border-amber-200";
    li.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-2xl">${medal}</span>
          <span class="font-semibold text-amber-800">${name}</span>
        </div>
        <span class="text-amber-700 font-bold text-lg">${score}</span>
      </div>
    `;
    leaderboardList.appendChild(li);
  });
}

// --- Room Members ---
function renderRoomMembers(memberDocs) {
  if (!roomMembersList || !membersCount) return;
  
  roomMembersList.innerHTML = "";
  membersCount.textContent = `${memberDocs.length} player${memberDocs.length !== 1 ? 's' : ''}`;
  
  if (!memberDocs.length) {
    const div = document.createElement("div");
    div.className = "col-span-full text-center py-8 text-blue-500";
    div.textContent = "No players in room yet";
    roomMembersList.appendChild(div);
    return;
  }

  memberDocs.forEach((doc) => {
    const data = doc.data();
    const memberDiv = document.createElement("div");
    memberDiv.className = "bg-white rounded-lg p-4 shadow-sm border border-blue-200 hover:shadow-md transition-shadow duration-200";
    memberDiv.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="text-2xl">${data.emoji || "👤"}</span>
        <div>
          <div class="font-semibold text-blue-800">${data.name || "Player"}</div>
          <div class="text-sm text-blue-600">Score: ${data.score || 0}</div>
        </div>
      </div>
    `;
    roomMembersList.appendChild(memberDiv);
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
    }

    // 2) Refresh from Firestore (authoritative)
    const userRef = doc(db, "users", clientId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      if (profileNameInput && data.name) profileNameInput.value = data.name;
      if (profileEmojiInput && data.emoji) profileEmojiInput.value = data.emoji;
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


