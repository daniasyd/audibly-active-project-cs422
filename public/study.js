// study.js — Study flow (Question → Answer (dictation) → Review (yes/no) → Next card → Summary)
document.addEventListener("DOMContentLoaded", async () => {
  // --- DOM refs
  const backBtn = document.getElementById("studyBackBtn");
  const timerEl = document.getElementById("studyTimer");

  const titleEl = document.getElementById("studySetTitle");

  const screenQuestion = document.getElementById("screenQuestion");
  const screenAnswer = document.getElementById("screenAnswer");
  const screenReview = document.getElementById("screenReview");
  const screenSummary = document.getElementById("screenSummary");

  const audioGate = document.getElementById("audioGate");
  const audioGateBtn = document.getElementById("audioGateBtn");

  const userAnswerText = document.getElementById("userAnswerText");
  const reviewUserText = document.getElementById("reviewUserText");
  const reviewCorrectText = document.getElementById("reviewCorrectText");
  const countCorrectBtn = document.getElementById("countCorrectBtn");
  const reviewOutcome = document.getElementById("reviewOutcome");

  const screenBreak = document.getElementById("screenBreak");
  const breakTimerEl = document.getElementById("breakTimer");
  const breakRightEl = document.getElementById("breakRight");
  const breakHomeBtn = document.getElementById("breakHomeBtn");

  const skipBtn = document.getElementById("skipBtn");

  const sumTime = document.getElementById("sumTime");
  const sumRight = document.getElementById("sumRight");
  const sumWrong = document.getElementById("sumWrong");
  const summaryTryBtn = document.getElementById("summaryTryBtn");
  const summaryHomeBtn = document.getElementById("summaryHomeBtn");


  // --- URL params: ?id=<setId>&mode=<normal|pomodoro>
  const params = new URLSearchParams(location.search);
  const setId = params.get("id");
  const mode = (params.get("mode") || "normal").toLowerCase();

  const workMins = Math.max(1, parseInt(params.get("work") || "25", 10));
  const restMins = Math.max(1, parseInt(params.get("rest") || "5", 10));
  const isPomodoro = mode === "pomodoro";


  // --- iOS detection
  const isIOS = /iP(hone|od|ad)/.test(navigator.platform) ||
    (navigator.userAgent.includes("Mac") && "ontouchend" in document);

  // --- Timer (elapsed up-counter)
  let startTime = Date.now();
  let timerHandle = null;
  let workTimeout = null;   // add beside timerHandle/startTime

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  };
  const startTimer = () => {
    if (timerHandle) clearInterval(timerHandle);
    startTime = Date.now();
    timerHandle = setInterval(() => {
      const secs = Math.floor((Date.now() - startTime) / 1000);
      if (timerEl) timerEl.textContent = fmt(secs);
    }, 1000);
    if (isPomodoro) {
      if (workTimeout) clearTimeout(workTimeout);
      workTimeout = setTimeout(() => {
        // Trigger break using the selected rest length (in seconds)
        startBreakCountdown(restMins * 60);
      }, workMins * 60 * 1000);
    }

  };

  // --- Back
  backBtn?.addEventListener("click", () => {
    window.location.href = "home.html";
  });

  // Result screen
  const screenResult = document.getElementById("screenResult");
  const resultTitleEl = document.getElementById("resultTitle");

  // Transition lock to prevent overlapping flows
  let inCardTransition = false;

  // Helper to cancel any speech/recognition before swapping screens
  function stopAllAudioIO() {
    try { stopAnswerRecognition?.(); } catch { }
    try { window.speechSynthesis?.cancel(); } catch { }
  }


  // === Auto-grade helpers ===

  // light tokenizer & cleaners
  // Words to ignore in token comparisons (structure/fillers + generic labels)
  const STOP_WORDS = new Set([
    // articles / auxiliaries / connectors
    "the", "a", "an", "to", "of", "and", "or", "is", "are", "was", "were", "be", "been", "being",
    "do", "does", "did", "have", "has", "had", "will", "would", "shall", "should", "can", "could", "may", "might", "must",
    // prepositions / deictics / function words
    "in", "on", "at", "by", "for", "from", "with", "without", "into", "as", "than", "then",
    "this", "that", "these", "those", "here", "there",
    "which", "who", "whom", "whose", "what", "when", "where", "why", "how",
    // conversational fillers
    "just", "only", "really", "very", "please", "uh", "um",
    // domain-generic labels we don’t want to dominate similarity
    "name", "answer", "value", "type", "kind", "thing", "stuff",
    "capital", "city", "country", "state", "continent", "color", "number", "year"
  ]);

  const NUMBER_WORDS = new Map([
    ["zero", "0"], ["one", "1"], ["two", "2"], ["three", "3"], ["four", "4"], ["five", "5"], ["six", "6"], ["seven", "7"], ["eight", "8"], ["nine", "9"],
    ["ten", "10"], ["eleven", "11"], ["twelve", "12"], ["thirteen", "13"], ["fourteen", "14"], ["fifteen", "15"], ["sixteen", "16"], ["seventeen", "17"], ["eighteen", "18"], ["nineteen", "19"],
    ["twenty", "20"], ["thirty", "30"], ["forty", "40"], ["fifty", "50"], ["sixty", "60"], ["seventy", "70"], ["eighty", "80"], ["ninety", "90"]
  ]);

  function stripDiacritics(s) { return s.normalize("NFD").replace(/\p{Diacritic}/gu, ""); }

  function normalize(text) {
    if (!text) return "";
    let t = String(text).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    t = t.replace(/[^\p{L}\p{N}\s]/gu, " ");   // remove punctuation
    t = t.replace(/\s+/g, " ").trim();         // collapse spaces
    // number words → digits (keep your existing NUMBER_WORDS mapping if you have one)
    t = t.split(" ").map(tok => NUMBER_WORDS?.get(tok) || tok).join(" ");
    // light plural stem (dogs -> dog, boxes -> box)
    t = t.replace(/\b(\p{L}+?)(s|es)\b/gu, "$1");
    // DROP STOPWORDS here
    t = t.split(" ").filter(tok => tok && !STOP_WORDS.has(tok)).join(" ");
    return t.trim();
  }

  function tokens(s) {
    return normalize(s).split(" ").filter(Boolean);
  }


  // Jaccard on tokens
  function jaccard(a, b) {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (!A.size && !B.size) return 1;
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    const uni = A.size + B.size - inter;
    return inter / (uni || 1);
  }

  // Levenshtein similarity on characters
  function editSim(a, b) {
    const s = normalize(a), t = normalize(b);
    const n = s.length, m = t.length;
    if (!n && !m) return 1;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) dp[i][0] = i;
    for (let j = 0; j <= m; j++) dp[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    const dist = dp[n][m];
    return 1 - (dist / Math.max(1, Math.max(n, m)));
  }

  // Combine signals → score in [0,1]
  function combinedScore(user, correct) {
    const U = normalize(user), C = normalize(correct);
    if (U && U === C) return 1;
    const jac = jaccard(U, C);
    const ed = editSim(U, C);
    // balance typos (edit) and multi-word overlap (jaccard)
    return Math.max(0, Math.min(1, 0.50 * ed + 0.50 * jac));
  }

  // small token helpers
  function tokenArray(s) { return tokens(s); }
  function hasSignificantOverlap(userToks, correctToks) {
    // any shared token of length >= 4?
    const C = new Set(correctToks);
    return userToks.some(t => t.length >= 4 && C.has(t));
  }
  function isNonEmptySubset(userToks, correctToks) {
    if (userToks.length === 0) return false;
    const C = new Set(correctToks);
    return userToks.every(t => C.has(t));
  }

  function hasTokenSubstringOverlap(userToks, correctToks) {
    // e.g., "melon" in "watermelon" or "nyc" in "newyorkcity" (we’ll still require len>=4)
    for (const u of userToks) {
      if (u.length < 4) continue;
      for (const c of correctToks) {
        if (c.length < 4) continue;
        if (c.includes(u) || u.includes(c)) return true;
      }
    }
    return false;
  }

  function overlapStats(userToks, correctToks) {
    const C = new Set(correctToks);
    let overlap = 0;
    for (const t of userToks) if (C.has(t)) overlap++;
    const coverage = correctToks.length ? overlap / correctToks.length : 0; // how much of correct covered
    const userRecall = userToks.length ? overlap / userToks.length : 0;       // how much of user matches
    return { overlap, coverage, userRecall };
  }



  // Evaluate against one or many acceptable answers
  function evaluateAnswer(userRaw, correctRawOrArray) {
    const variants = Array.isArray(correctRawOrArray)
      ? correctRawOrArray
      : String(correctRawOrArray || "").split("|");

    // compute best score across variants
    let best = 0, bestVariant = variants[0] || "";
    for (const v of variants) {
      const s = combinedScore(userRaw, v);
      if (s > best) { best = s; bestVariant = v; }
    }

    // dynamic thresholds by length
    const ctoks = tokens(bestVariant);
    const utoks = tokens(userRaw);

    const lenC = ctoks.length;
    let HI = 0.88, LO = 0.55;
    if (lenC <= 3) HI = 0.92;          // very short correct answers: stricter for autocorrect
    if (lenC >= 4) LO = 0.50;          // multi-word / longer answers: slightly more lenient for partials

    // subset / overlap heuristics → send to manual review instead of auto-incorrect
    const subsetPartial = (ctoks.length >= 2) && isNonEmptySubset(utoks, ctoks);
    const overlapPartial = hasSignificantOverlap(utoks, ctoks);
    const substringPartial = hasTokenSubstringOverlap(utoks, ctoks);


    if (best >= HI) return { kind: "auto-correct", score: best, match: bestVariant };

    // if it’s clearly low **but** we detect subset/overlap, keep it in review
    if (best <= LO) {
      if (subsetPartial || overlapPartial || substringPartial) {
        const { overlap, coverage } = overlapStats(utoks, ctoks);
        const isLong = ctoks.length >= 4;
        // Require stronger overlap for long answers; otherwise auto-incorrect
        if (isLong && (overlap < 2 || coverage < 0.25)) {
          return { kind: "auto-incorrect", score: best, match: bestVariant };
        }
        return { kind: "needs-review", score: best, match: bestVariant };
      }
      return { kind: "auto-incorrect", score: best, match: bestVariant };
    }

    // middle band → manual review
    return { kind: "needs-review", score: best, match: bestVariant };
  }





  // --- Screen togglers (ensure only one screen visible)

  function resetResultUI() {
    if (!resultTitleEl) return;
    resultTitleEl.textContent = "";
    resultTitleEl.classList.remove("result-good", "result-bad");
  }

  function hideAllScreens() {
    screenQuestion?.classList.add("hidden");
    screenAnswer?.classList.add("hidden");
    screenReview?.classList.add("hidden");
    screenSummary?.classList.add("hidden");
    screenBreak?.classList?.add("hidden");
    screenResult?.classList.add("hidden");
  }

  function showQuestion() {
    hideAllScreens();
    resetResultUI();
    screenQuestion?.classList.remove("hidden");
    showTopChrome?.();
  }

  function showAnswer() {
    hideAllScreens();
    resetResultUI();
    screenAnswer?.classList.remove("hidden");
    showTopChrome?.();
  }

  function showReview() {
    hideAllScreens();
    resetResultUI();
    screenReview?.classList.remove("hidden");
    showTopChrome?.();
  }

  function showSummary() {
    hideAllScreens();
    resetResultUI();
    screenSummary?.classList.remove("hidden");
    hideTopChrome?.();
  }

  function showBreak() {
    hideAllScreens();
    resetResultUI();
    screenBreak?.classList.remove("hidden");
    hideTopChrome?.();
  }



  function showResultScreen(isCorrect) {
    hideAllScreens();              // hides all other screens first
    // do NOT resetResultUI() here (we’re about to set it)
    if (resultTitleEl) {
      resultTitleEl.textContent = isCorrect
        ? "Correct, well done!"
        : "Incorrect, better luck next time!";
      resultTitleEl.classList.toggle("result-good", isCorrect);
      resultTitleEl.classList.toggle("result-bad", !isCorrect);
    }
    screenResult?.classList.remove("hidden");
  }


  async function showResultAndAdvance(isCorrect) {
    if (isOnBreak) return;                 // if Pomodoro break triggered, don’t show result
    if (inCardTransition) return;          // guard against double-triggers
    inCardTransition = true;

    stopAllAudioIO();
    showResultScreen(isCorrect);

    // Count it NOW so summary/break see the right numbers
    setReviewOutcome(isCorrect);           // your existing counter incrementer

    // Speak the result (blocking), then move on
    try {
      const phrase = isCorrect
        ? "Correct, well done!"
        : "Incorrect, better luck next time!";
      // re-use your TTS; if you have speakText()/speak() wrapper, use that:
      await new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(phrase);
        u.onend = resolve; u.onerror = resolve;
        window.speechSynthesis.speak(u);
      });
    } catch { }

    // Small pause so the UI feels responsive but not abrupt
    await new Promise(r => setTimeout(r, 250));

    // Now continue as usual
    nextCardOrFinish();
    inCardTransition = false;
  }



  function setBreakTimer(secs) {
    if (breakTimerEl) breakTimerEl.textContent = fmt(Math.max(0, secs));
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

  // Header controls
  const headerBack = document.getElementById("studyBackBtn");
  const headerTimer = document.getElementById("studyTimer");

  function hideTopChrome() {
    headerBack?.classList.add("hidden");
    headerTimer?.classList.add("hidden");
  }

  function showTopChrome() {
    headerBack?.classList.remove("hidden");
    headerTimer?.classList.remove("hidden");
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
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);

      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.28);
    } catch (e) {
      console.warn("ding failed:", e);
    }
  }

  async function playRing() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const g = ctx.createGain();
      g.gain.value = 0.001;
      g.connect(ctx.destination);

      // 3 short beeps: A5, C6, E6
      const notes = [880, 1046.5, 1318.5];
      let t = ctx.currentTime;
      notes.forEach((f) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(f, t);
        o.connect(g);
        g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        o.start(t);
        o.stop(t + 0.3);
        t += 0.35;
      });
    } catch (e) {
      console.warn("ring failed:", e);
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
        if (opts.rate) u.rate = opts.rate;
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
            try { speechSynthesis.resume(); } catch { }
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
        if (opts.rate) u.rate = opts.rate;
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
            try { speechSynthesis.resume(); } catch { }
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

  let breakInterval = null;
  let isOnBreak = false;
  async function startBreakCountdown(totalSecs) {
    // mark state to avoid Review being shown mid-transition
    isOnBreak = true;

    // stop any active listening or speech ASAP
    stopAnswerRecognition();
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { }

    // populate "X out of Y" using stable session totals
    if (breakRightEl) breakRightEl.textContent = `${correctCount} out of ${sessionTotal}`;

    // show the Break screen and initialize countdown display
    showBreak();
    setBreakTimer(totalSecs);

    // ring once upon entering break
    await playRing();

    // ensure any previous countdown is cleared
    if (breakInterval) { clearInterval(breakInterval); breakInterval = null; }

    let secs = totalSecs;
    breakInterval = setInterval(async () => {
      secs -= 1;
      setBreakTimer(secs);

      if (secs <= 0) {
        clearInterval(breakInterval);
        breakInterval = null;

        // ring at break end
        await playRing();

        // stay on the Break screen; user can tap "Back to Home"
        // If you later want to auto-resume study:
        // isOnBreak = false;
        // await runQuestionFlow();
      }
    }, 1000);
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
      if (isOnBreak) return;  // ⬅️ don’t go to review during break
      const userText = (userAnswerText?.textContent || "").trim();
      // support multiple correct variants with "a|b|c" if you want
      const correctRaw = currentCorrectAnswer;
      const verdict = evaluateAnswer(userText, correctRaw);

      if (verdict.kind === "auto-correct") {
        showResultAndAdvance(true);
      } else if (verdict.kind === "auto-incorrect") {
        showResultAndAdvance(false);
      } else {
        proceedToReviewFlow({ userText, correctText: correctRaw });
      }

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
    try { recognition?.stop?.(); } catch { }
    recognizing = false;
    if (silenceTimer) { clearInterval(silenceTimer); silenceTimer = null; }
  }

  // --- Yes/No on review
  function classifyYesNo(text) {
    if (!text) return null;
    const s = text.toLowerCase().trim();
    const yesWords = ["yes", "yeah", "yep", "yup", "sure", "correct", "right", "count it", "mark it", "that is correct", "affirmative", "ok", "okay", "aye"];
    const noWords = ["no", "nope", "nah", "incorrect", "wrong", "don't", "do not", "not correct", "that is wrong", "negative"];
    if (yesWords.some(w => s.includes(w))) return "yes";
    if (noWords.some(w => s.includes(w))) return "no";
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
        try { rec.stop(); } catch { }
        done(null);
      }, windowMs);

      rec.onresult = (evt) => {
        try { clearTimeout(timer); } catch { }
        const text = evt.results?.[0]?.[0]?.transcript || "";
        const ans = classifyYesNo(text);
        done(ans); // "yes" | "no" | null
      };
      rec.onerror = () => { try { clearTimeout(timer); } catch { }; done(null); };
      rec.onend = () => { try { clearTimeout(timer); } catch { }; done(null); };

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
  let sessionTotal = 0;
  let currentSetName = "Untitled";

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

  function setReviewOutcome(isCorrect) {
    // just update counters — no TTS, no UI, no advancing here
    if (isCorrect) correctCount++; else incorrectCount++;

    // Hide button so it doesn't remain visible
    countCorrectBtn?.classList.add("hidden");

    // Optionally update the outcome UI if you want,
    // or leave it invisible since the Result screen is shown immediately
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

      if (sumTime) sumTime.textContent = `Time: ${fmt(elapsedSecs)}`;
      if (sumRight) sumRight.textContent = `${correctCount} out of ${total}`;
      if (sumWrong) sumWrong.textContent = `${incorrectCount} out of ${total}`;

      // Save session stats to localStorage for stats page
      try {
        const STORAGE_KEY = "studySessions";
        const raw = localStorage.getItem(STORAGE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        const sessions = Array.isArray(arr) ? arr : [];

        sessions.push({
          ts: Date.now(),
          mode,                 // "normal" or "pomodoro" (already defined at top)
          setId,
          setName: currentSetName,
          correct: correctCount,
          incorrect: incorrectCount,
          total,
          durationSecs: elapsedSecs,
        });

        // Keep only the last 50 sessions to avoid infinite growth
        const trimmed = sessions.slice(-50);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch (e) {
        console.warn("Could not save study session stats:", e);
      }


      showSummary();

    }
  }

  async function proceedToReviewFlow({ userText, correctText }) {
    if (isOnBreak || inCardTransition) return;
    reviewUserText.textContent = userText && userText !== "..." ? userText : "(no answer)";
    reviewCorrectText.textContent = correctText || "(no correct answer)";
    showReview();

    try { await ensureVoices?.(); } catch { }
    await speakTextAndWait(`User Answer: ${reviewUserText.textContent}`);
    await speakTextAndWait(`Correct Answer: ${reviewCorrectText.textContent}`);
    await speakTextAndWait(`Count as correct?`);
    await playDing();

    const ans = await listenForYesNo({ windowMs: 5000, reprompt: true });
    if (isOnBreak) return;  // break started while we were waiting
    if (ans === "yes") {
      showResultAndAdvance(true);
      return;
    } else if (ans === "no") {
      showResultAndAdvance(false);
      return;
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
    if (isOnBreak) return;  // ⬅️ ignore taps during break
    showResultAndAdvance(true);
  });


  // summaryDoneBtn?.addEventListener("click", () => {
  //   window.location.href = "sets.html"; // or "home.html"
  // });

  summaryTryBtn?.addEventListener("click", () => {
    // reload this study with same params
    const params = new URLSearchParams(location.search);
    const setId = params.get("id");
    const mode = (params.get("mode") || "normal").toLowerCase();
    const idQS = setId ? `?id=${encodeURIComponent(setId)}&mode=${encodeURIComponent(mode)}` : "";
    window.location.href = `study.html${idQS}`;
  });

  summaryHomeBtn?.addEventListener("click", () => {
    window.location.href = "home.html";
  });

  breakHomeBtn?.addEventListener("click", () => {
    window.location.href = "home.html";
  });


  // --- Load the set and start
  try {
    const res = await fetch("/api/sets/mine", { headers: { "Accept": "application/json" } });
    const payload = await res.json();
    const got = Array.isArray(payload?.sets) ? payload.sets
      : Array.isArray(payload) ? payload
        : [];

    if (!got.length) throw new Error("No sets available");

    let set = null;
    if (setId) {
      set = got.find(s => String(s.id) === String(setId) || String(s._id) === String(setId));
    }
    if (!set) set = got[0];

    const count = Array.isArray(set.cards) ? set.cards.length : 0;
    titleEl.textContent = `${set.name || "Untitled"} | ${count} ${count === 1 ? "card" : "cards"}`;
    currentSetName = set.name || "Untitled";

    // Color-coding based on mode
    if (mode === "normal") {
      titleEl.classList.add("study-setbox-yellow");
    } else if (mode === "pomodoro") {
      titleEl.classList.add("study-setbox-green");
    }

    cards = Array.isArray(set.cards) ? set.cards : [];
    sessionTotal = cards.length;   // <= capture total once, never 0 later
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
          try { await ensureVoices?.(); } catch { }

          if (typeof startTimer === "function") startTimer();

          if (isIOS) {
            // iOS: do an audible utterance *inside this tap* first; don't request mic yet
            await speakAudibleOnce("Audio enabled.");
            await runQuestionFlow();
          } else {
            // Non-iOS: mic permission prime is fine here
            try { await primeMicPermission?.(); } catch { }
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
    if (workTimeout) clearTimeout(workTimeout);
    if (breakInterval) clearInterval(breakInterval);
    if ("speechSynthesis" in window) { try { window.speechSynthesis.cancel(); } catch { } }
    stopAnswerRecognition();
  });

});
