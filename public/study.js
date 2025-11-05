// study.js — Study flow (Question → Answer (dictation) → Review (yes/no) → Next card → Summary)
document.addEventListener("DOMContentLoaded", async () => {
  // --- DOM refs
  const backBtn           = document.getElementById("studyBackBtn");
  const timerEl           = document.getElementById("studyTimer");
  const titleEl           = document.getElementById("studySetTitle");

  const screenQuestion    = document.getElementById("screenQuestion");
  const screenAnswer      = document.getElementById("screenAnswer");
  const screenReview      = document.getElementById("screenReview");
  const screenSummary     = document.getElementById("screenSummary");

  const audioGate         = document.getElementById("audioGate");
  const audioGateBtn      = document.getElementById("audioGateBtn");

  const userAnswerText    = document.getElementById("userAnswerText");
  const reviewUserText    = document.getElementById("reviewUserText");
  const reviewCorrectText = document.getElementById("reviewCorrectText");
  const countCorrectBtn   = document.getElementById("countCorrectBtn");
  const reviewOutcome     = document.getElementById("reviewOutcome");

  // const sumCorrect        = document.getElementById("sumCorrect");
  // const sumIncorrect      = document.getElementById("sumIncorrect");
  // const summaryDoneBtn    = document.getElementById("summaryDoneBtn");

  const skipBtn           = document.getElementById("skipBtn");

  const sumTime        = document.getElementById("sumTime");
  const sumRight       = document.getElementById("sumRight");
  const sumWrong       = document.getElementById("sumWrong");
  const summaryTryBtn  = document.getElementById("summaryTryBtn");
  const summaryHomeBtn = document.getElementById("summaryHomeBtn");


  // --- URL params: ?id=<setId>&mode=<normal|pomodoro>
  const params = new URLSearchParams(location.search);
  const setId  = params.get("id");
  const mode   = (params.get("mode") || "normal").toLowerCase();

  // --- iOS detection
  const isIOS = /iP(hone|od|ad)/.test(navigator.platform) ||
                (navigator.userAgent.includes("Mac") && "ontouchend" in document);

  // --- Timer (elapsed up-counter)
  let startTime = Date.now();
  let timerHandle = null;
  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
  };
  const startTimer = () => {
    if (timerHandle) clearInterval(timerHandle);
    startTime = Date.now();
    timerHandle = setInterval(() => {
      const secs = Math.floor((Date.now() - startTime) / 1000);
      if (timerEl) timerEl.textContent = fmt(secs);
    }, 1000);
  };

  // --- Back
  backBtn?.addEventListener("click", () => {
    window.location.href = "home.html";
  });

  // --- Screen togglers (ensure only one screen visible)
  function showQuestion() {
    screenQuestion?.classList.remove("hidden");
    screenAnswer?.classList.add("hidden");
    screenReview?.classList.add("hidden");
    screenSummary?.classList.add("hidden");
  }
  function showAnswer() {
    screenQuestion?.classList.add("hidden");
    screenAnswer?.classList.remove("hidden");
    screenReview?.classList.add("hidden");
    screenSummary?.classList.add("hidden");
  }
  function showReview() {
    screenQuestion?.classList.add("hidden");
    screenAnswer?.classList.add("hidden");
    screenReview?.classList.remove("hidden");
    screenSummary?.classList.add("hidden");
  }
  function showSummary() {
    screenQuestion?.classList.add("hidden");
    screenAnswer?.classList.add("hidden");
    screenReview?.classList.add("hidden");
    screenSummary?.classList.remove("hidden");
  }

  // --- UI resets so previous state doesn't leak
  function resetAnswerUI() {
    if (userAnswerText) userAnswerText.textContent = "...";
  }
  function resetReviewUI() {
    if (reviewUserText) reviewUserText.textContent = "...";
    if (reviewCorrectText) reviewCorrectText.textContent = "...";
    countCorrectBtn?.classList.remove("hidden");
    if (reviewOutcome) {
      reviewOutcome.textContent = "";
      reviewOutcome.classList.add("hidden");
      reviewOutcome.classList.remove("outcome-good", "outcome-bad");
    }
  }

  // --- Ding (simple per-call context)
  async function playDing() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3,  ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);

      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.28);
    } catch (e) {
      console.warn("ding failed:", e);
    }
  }

  // --- TTS helpers (reverted to the working pattern for your setup)
  function speakQuestionAndWait(questionText, opts = { lang: "en-US", rate: 1.0, pitch: 1.0 }) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      try {
        const u = new SpeechSynthesisUtterance(`Question: ${questionText}`);
        u.lang = opts.lang ?? "en-US";
        u.volume = 1.0;
        if (opts.rate)  u.rate = opts.rate;
        if (opts.pitch) u.pitch = opts.pitch;

        const voices = speechSynthesis.getVoices() || [];
        const v = voices.find(v => v.lang?.startsWith(u.lang)) || voices[0];
        if (v) u.voice = v;

        u.onend = () => resolve();
        u.onerror = () => resolve();

        // This combination worked for you post-HTTPS: cancel → speak, with a resume nudge
        speechSynthesis.cancel();
        speechSynthesis.speak(u);

        // mobile resume nudge loop (helps iOS/Android reliably start)
        const t0 = Date.now();
        const tick = () => {
          if (!speechSynthesis.speaking && Date.now() - t0 < 1200) {
            try { speechSynthesis.resume(); } catch {}
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      } catch {
        resolve();
      }
    });
  }
  function speakQuestionAndWaitWithTimeout(questionText, ms = 8000) {
    return Promise.race([
      speakQuestionAndWait(questionText),
      new Promise((resolve) => setTimeout(resolve, ms)),
    ]);
  }

  function speakTextAndWait(text, opts = { lang: "en-US", rate: 1.0, pitch: 1.0 }, timeoutMs = 8000) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = opts.lang ?? "en-US";
        u.volume = 1.0;
        if (opts.rate)  u.rate = opts.rate;
        if (opts.pitch) u.pitch = opts.pitch;

        const voices = speechSynthesis.getVoices() || [];
        const v = voices.find(v => v.lang?.startsWith(u.lang)) || voices[0];
        if (v) u.voice = v;

        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };

        u.onend = done;
        u.onerror = done;

        // Same pattern for reliability
        speechSynthesis.cancel();
        speechSynthesis.speak(u);

        const t0 = Date.now();
        const tick = () => {
          if (!speechSynthesis.speaking && Date.now() - t0 < 1200) {
            try { speechSynthesis.resume(); } catch {}
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);

        setTimeout(done, timeoutMs);
      } catch {
        resolve();
      }
    });
  }

  // Short audible primer we run on iOS during the Tap gesture
  async function speakAudibleOnce(line = "Audio enabled.") {
    await speakTextAndWait(line, { lang: "en-US", rate: 1.0, pitch: 1.0 }, 4000);
    await new Promise(r => setTimeout(r, 120)); // brief settle to avoid overlap
  }

  // --- Optional helpers
  async function ensureVoices() {
    return new Promise((resolve) => {
      const have = () => (speechSynthesis.getVoices() || []).length > 0;
      if (!("speechSynthesis" in window)) return resolve();
      if (have()) return resolve();
      const on = () => { if (have()) { speechSynthesis.removeEventListener("voiceschanged", on); resolve(); } };
      speechSynthesis.addEventListener("voiceschanged", on);
      setTimeout(() => { if (have()) { speechSynthesis.removeEventListener("voiceschanged", on); resolve(); } }, 1000);
    });
  }
  async function primeMicPermission() {
    try {
      const stream = await navigator.mediaDevices?.getUserMedia?.({ audio: true });
      stream?.getTracks()?.forEach(t => t.stop());
    } catch { /* ignore */ }
  }

  

  // --- Speech Recognition (Web Speech API; iOS Safari does not support this, Chrome on iOS uses WebKit)
  let recognition = null;
  let recognizing = false;
  let silenceTimer = null;
  let lastHeardAt = 0;

  const SILENCE_MS = 2000;        // stop 2s after last speech (after we've heard some speech)
  const INITIAL_THINK_MS = 8000;  // allow thinking time before first speech
  const MAX_LISTEN_MS = 90000;    // safety cap

  function setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    let hasHeardAnything = false;
    let maxListenTimeout = null;

    rec.onstart = () => {
      recognizing = true;
      lastHeardAt = 0;

      // watchdog: post-speech silence and hard cap
      if (silenceTimer) clearInterval(silenceTimer);
      const startedAt = Date.now();
      silenceTimer = setInterval(() => {
        if (!recognizing) return;
        const now = Date.now();

        if (!hasHeardAnything) {
          // still within initial think window? keep listening
          if (now - startedAt < INITIAL_THINK_MS) return;
          // after think window, we still allow until a cap/hard stop; keep listening
          return;
        }

        // after first speech chunk, enforce 2s silence cutoff
        if (lastHeardAt && now - lastHeardAt >= SILENCE_MS) {
          stopAnswerRecognition();
        }
      }, 250);

      if (maxListenTimeout) clearTimeout(maxListenTimeout);
      maxListenTimeout = setTimeout(() => {
        stopAnswerRecognition();
      }, MAX_LISTEN_MS);
    };

    rec.onresult = (evt) => {
      let finalText = "";
      let interimText = "";

      for (let i = evt.resultIndex; i < evt.results.length; i++) {
        const res = evt.results[i];
        const txt = res[0]?.transcript || "";
        if (!txt) continue;
        hasHeardAnything = true;
        lastHeardAt = Date.now();

        if (res.isFinal) finalText += txt;
        else interimText += txt;
      }

      const show = (finalText || interimText || "").trim();
      if (userAnswerText) userAnswerText.textContent = show || "...";
    };

    rec.onerror = (e) => {
      console.warn("SR error:", e?.error || e);
      stopAnswerRecognition();
    };

    rec.onend = () => {
      recognizing = false;
      if (silenceTimer) { clearInterval(silenceTimer); silenceTimer = null; }

      // When recognition ends, move to review for current card
      const userText = (userAnswerText?.textContent || "").trim();
      proceedToReviewFlow({ userText, correctText: currentCorrectAnswer });
    };

    return rec;
  }

  function startAnswerRecognition() {
    if (recognizing) return;
    // Create a fresh instance each time (mobile reliability)
    recognition = setupRecognition();
    if (!recognition) {
      console.warn("SpeechRecognition not supported; no dictation available.");
      if (userAnswerText) userAnswerText.textContent = "(Speech input not supported on this browser)";
      return;
    }
    try {
      recognition.start();
    } catch (e) {
      console.warn("SR start error (safe to ignore):", e);
    }
  }

  function stopAnswerRecognition() {
    try { recognition?.stop?.(); } catch {}
    recognizing = false;
    if (silenceTimer) { clearInterval(silenceTimer); silenceTimer = null; }
  }

  // --- Yes/No on review
  function classifyYesNo(text) {
    if (!text) return null;
    const s = text.toLowerCase().trim();
    const yesWords = ["yes","yeah","yep","yup","sure","correct","right","count it","mark it","that is correct","affirmative","ok","okay","aye"];
    const noWords  = ["no","nope","nah","incorrect","wrong","don't","do not","not correct","that is wrong","negative"];
    if (yesWords.some(w => s.includes(w))) return "yes";
    if (noWords.some(w => s.includes(w)))  return "no";
    return null;
  }

  function listenForYesNo({ windowMs = 5000, reprompt = true } = {}) {
    return new Promise((resolve) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return resolve(null);

      const rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      let settled = false;
      const done = (val) => { if (!settled) { settled = true; resolve(val); } };

      const timer = setTimeout(() => {
        try { rec.stop(); } catch {}
        done(null);
      }, windowMs);

      rec.onresult = (evt) => {
        try { clearTimeout(timer); } catch {}
        const text = evt.results?.[0]?.[0]?.transcript || "";
        const ans = classifyYesNo(text);
        done(ans); // "yes" | "no" | null
      };
      rec.onerror = () => { try { clearTimeout(timer); } catch {}; done(null); };
      rec.onend = () => { try { clearTimeout(timer); } catch {}; done(null); };

      try { rec.start(); } catch { done(null); }
    }).then(async (ans) => {
      if (ans) return ans;
      if (reprompt) {
        await speakTextAndWait("Please say yes or no.");
        await playDing();
        return listenForYesNo({ windowMs: 5000, reprompt: false });
      }
      return null;
    });
  }

  // --- Session / cards state
  let cards = [];
  let currentIdx = 0;
  let currentCorrectAnswer = "";
  let correctCount = 0;
  let incorrectCount = 0;

  function loadCurrentCard() {
    const c = cards[currentIdx] || {};
    const questionText = c?.q || "No question text";
    currentCorrectAnswer = c?.a || "";
    return { questionText, correctAnswer: currentCorrectAnswer };
  }

  async function runQuestionFlow() {
    // Fresh UI for a new card (no TTS cancel here; helper handles it)
    resetAnswerUI();
    resetReviewUI();

    const { questionText } = loadCurrentCard();

    showQuestion();
    await speakQuestionAndWaitWithTimeout(questionText, 8000);

    setTimeout(async () => {
      showAnswer();
      await playDing();
      startAnswerRecognition();
    }, 500);
  }

  async function setReviewOutcome(isCorrect) {
    // Hide the button
    countCorrectBtn?.classList.add("hidden");

    // Update counters
    if (isCorrect) correctCount++; else incorrectCount++;

    // Outcome UI + TTS
    reviewOutcome.classList.remove("hidden", "outcome-good", "outcome-bad");
    if (isCorrect) {
      reviewOutcome.textContent = "Well Done!";
      reviewOutcome.classList.add("outcome-good");
      await speakTextAndWait("Well done!");
    } else {
      reviewOutcome.textContent = "You'll get it next time";
      reviewOutcome.classList.add("outcome-bad");
      await speakTextAndWait("You will get it next time.");
    }

    nextCardOrFinish();
  }

  function nextCardOrFinish() {
    stopAnswerRecognition(); // safety
    currentIdx++;
    if (currentIdx < cards.length) {
      setTimeout(() => { runQuestionFlow(); }, 400);
    } else {
      // sumCorrect.textContent = String(correctCount);
      // sumIncorrect.textContent = String(incorrectCount);
      const elapsedSecs = Math.floor((Date.now() - startTime) / 1000);
      const total = cards.length;

      if (sumTime)  sumTime.textContent  = `Time: ${fmt(elapsedSecs)}`;
      if (sumRight) sumRight.textContent = `${correctCount} out of ${total}`;
      if (sumWrong) sumWrong.textContent = `${incorrectCount} out of ${total}`;

      

      showSummary();

    }
  }

  async function proceedToReviewFlow({ userText, correctText }) {
    reviewUserText.textContent = userText && userText !== "..." ? userText : "(no answer)";
    reviewCorrectText.textContent = correctText || "(no correct answer)";
    showReview();

    try { await ensureVoices?.(); } catch {}
    await speakTextAndWait(`User Answer: ${reviewUserText.textContent}`);
    await speakTextAndWait(`Correct Answer: ${reviewCorrectText.textContent}`);
    await speakTextAndWait(`Count as correct?`);
    await playDing();

    const ans = await listenForYesNo({ windowMs: 5000, reprompt: true });
    if (ans === "yes") {
      await setReviewOutcome(true);
    } else if (ans === "no") {
      await setReviewOutcome(false);
    } else {
      // No clear voice response; leave the button visible for manual tap
    }
  }

  // --- Button behaviors
  skipBtn?.addEventListener("click", () => {
    console.log("Skip pressed — will advance to next question later");
    // OPTIONAL: implement skip behavior (e.g., mark incorrect and move on)
  });

  countCorrectBtn?.addEventListener("click", async () => {
    // Manual fallback: count as correct
    await setReviewOutcome(true);
  });

  // summaryDoneBtn?.addEventListener("click", () => {
  //   window.location.href = "sets.html"; // or "home.html"
  // });

  summaryTryBtn?.addEventListener("click", () => {
    // reload this study with same params
    const params = new URLSearchParams(location.search);
    const setId  = params.get("id");
    const mode   = (params.get("mode") || "normal").toLowerCase();
    const idQS   = setId ? `?id=${encodeURIComponent(setId)}&mode=${encodeURIComponent(mode)}` : "";
    window.location.href = `study.html${idQS}`;
  });

  summaryHomeBtn?.addEventListener("click", () => {
    window.location.href = "home.html";
  });


  // --- Load the set and start
  try {
    const res = await fetch("/api/sets/mine", { headers: { "Accept": "application/json" } });
    const payload = await res.json();
    const got = Array.isArray(payload?.sets) ? payload.sets
              : Array.isArray(payload)      ? payload
              : [];

    if (!got.length) throw new Error("No sets available");

    let set = null;
    if (setId) {
      set = got.find(s => String(s.id) === String(setId) || String(s._id) === String(setId));
    }
    if (!set) set = got[0];

    const count = Array.isArray(set.cards) ? set.cards.length : 0;
    titleEl.textContent = `${set.name || "Untitled"} | ${count} ${count === 1 ? "card" : "cards"}`;

    // Color-coding based on mode
    if (mode === "normal") {
      titleEl.classList.add("study-setbox-yellow");
    } else if (mode === "pomodoro") {
      titleEl.classList.add("study-setbox-green");
    }

    cards = Array.isArray(set.cards) ? set.cards : [];
    if (!cards.length) {
      titleEl.textContent = `${set.name || "Untitled"} | 0 cards`;
      return;
    }

    // --- TTS gated behind user gesture (mobile safe)
    try {
      if (audioGateBtn) {
        audioGateBtn.addEventListener("click", async () => {
          if (window.__gateUnlocked) return;
          window.__gateUnlocked = true;
          audioGateBtn.disabled = true;

          // Remove overlay immediately
          try { audioGate?.remove(); } catch {
            audioGate?.classList?.add("hidden");
            audioGate?.setAttribute?.("aria-hidden", "true");
          }

          // Load voices list (safe on all)
          try { await ensureVoices?.(); } catch {}

          if (typeof startTimer === "function") startTimer();

          if (isIOS) {
            // iOS: do an audible utterance *inside this tap* first; don't request mic yet
            await speakAudibleOnce("Audio enabled.");
            await runQuestionFlow();
          } else {
            // Non-iOS: mic permission prime is fine here
            try { await primeMicPermission?.(); } catch {}
            await runQuestionFlow();
          }
        }, { once: true });
      } else {
        // Desktop fallback (no gate)
        await ensureVoices();
        if (typeof startTimer === "function") startTimer();
        await runQuestionFlow();
      }
    } catch (e) {
      console.error("TTS setup error:", e);
    }

  } catch (err) {
    console.error(err);
    titleEl.textContent = "Failed to load set";
  }

  // --- Cleanup on unload
  window.addEventListener("beforeunload", () => {
    if (timerHandle) clearInterval(timerHandle);
    if ("speechSynthesis" in window) { try { window.speechSynthesis.cancel(); } catch {} }
    stopAnswerRecognition();
  });
});
