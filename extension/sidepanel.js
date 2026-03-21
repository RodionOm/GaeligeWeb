const API_BASE_URL = "http://localhost:3012"; // Update for production endpoint
const ANALYZE_URL = `${API_BASE_URL}/analyze`;

const analyzeBtn = document.getElementById("analyzeBtn");
const statusEl = document.getElementById("status");
const finalSummaryEl = document.getElementById("finalSummary");
const quizListEl = document.getElementById("quizList");
const learningContentEl = document.getElementById("learningContent");

const ttsAvailable = "speechSynthesis" in window;

function speakText(text, lang = "ga-IE") {
  if (!ttsAvailable || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

function showStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.classList.remove("error");
}

let selectedLanguage = null;
let selectedMode = null;
let fullData = null;

let quizData = [];
let currentQuestion = 0;
let score = 0;

// ------------------ UI ------------------

function showStep(step) {
  const sections = document.querySelectorAll(".panel-section");

  sections.forEach((el, index) => {
    el.style.display = index === step ? "block" : "none";
  });
}

function setEmptyState() {
  finalSummaryEl.innerHTML = `<div class="empty-state">Analyze a page to get started.</div>`;
  quizListEl.innerHTML = `<div class="empty-state">Quiz will appear after analysis.</div>`;
  learningContentEl.innerHTML = `<div class="empty-state">Learning cards will appear after analysis.</div>`;
}

// ------------------ SUMMARY ------------------

function formatSummaryText(text) {
  if (!text) return `<div class="empty-state">No summary available.</div>`;

  return text
    .split(/\n+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p>${part}</p>`)
    .join("");
}

function renderFinalSummary() {
  if (!fullData || !selectedLanguage || !selectedMode) return;

  let summaryBlock;

  if (selectedLanguage === "english") {
    summaryBlock = fullData.english_summary || {};
  } else {
    summaryBlock = fullData.irish_summary || {};
  }

  const text = summaryBlock[selectedMode] || "No summary available.";
  finalSummaryEl.innerHTML = formatSummaryText(text);
}

// ------------------ LEARNING MODE ------------------

function renderLearning() {
  if (!fullData || !fullData.vocabulary) {
    learningContentEl.innerHTML = `<div class="empty-state">No learning content available.</div>`;
    return;
  }

  learningContentEl.innerHTML = `
    <div class="learning-intro-card">
      <h3>Learn from this page</h3>
      <p>Here are the most useful Irish words and phrases extracted from the content you just summarized. Tap 🔊 to hear pronunciation.</p>
    </div>

    ${(fullData.vocabulary || []).map((item, index) => `
      <div class="vocab-item">
        <div class="vocab-top-line">
          <span class="vocab-number">${index + 1}</span>
          <strong>${item.irish}</strong>
          ${ttsAvailable ? `<button class="tts-btn" data-text="${item.irish}" data-lang="ga-IE">🔊</button>` : ""}
        </div>
        <div class="vocab-translation">${item.english}</div>
        <em>${item.example}</em>
      </div>
    `).join("")}
  `;

  if (ttsAvailable) {
    document.querySelectorAll(".tts-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const text = btn.getAttribute("data-text");
        const lang = btn.getAttribute("data-lang") || "ga-IE";
        speakText(text, lang);
      });
    });
  }
}

// ------------------ QUIZ ------------------

function renderQuizQuestion() {
  const q = quizData[currentQuestion];

  if (!q) {
    showQuizResult();
    return;
  }

  quizListEl.innerHTML = `
    <div class="quiz-card">
      <div class="quiz-progress">
        Question ${currentQuestion + 1} / ${quizData.length}
      </div>

      <div class="quiz-question">
        ${q.question}
      </div>

      <div class="quiz-options">
        ${q.options.map(opt => `<button class="quiz-option">${opt}</button>`).join("")}
      </div>
    </div>
  `;

  document.querySelectorAll(".quiz-option").forEach((btn) => {
    btn.addEventListener("click", () => handleAnswer(btn, q));
  });
}

function handleAnswer(button, question) {
  const selected = button.textContent;
  const correct = question.answer;

  document.querySelectorAll(".quiz-option").forEach((btn) => {
    btn.disabled = true;

    if (btn.textContent === correct) {
      btn.classList.add("correct");
    } else if (btn === button) {
      btn.classList.add("wrong");
    }
  });

  if (selected === correct) {
    score++;
  }

  setTimeout(() => {
    currentQuestion++;
    renderQuizQuestion();
  }, 1000);
}

function showQuizResult() {
  quizListEl.innerHTML = `
    <div class="quiz-card result">
      <h3>Your Score</h3>
      <div class="score">${score} / ${quizData.length}</div>

      <div class="action-stack">
        <button id="restartQuiz" class="primary-btn step-btn">Try Again</button>
        <button id="quizToSummaryBtn" class="secondary-btn step-btn">Back to Summary</button>
        <button id="quizToLearningBtn" class="primary-btn step-btn">Learn from this page</button>
        <button id="analyzeAgainBtn" class="secondary-btn step-btn">Analyze another page</button>
      </div>
    </div>
  `;

  const restartBtn = document.getElementById("restartQuiz");
  if (restartBtn) {
    restartBtn.addEventListener("click", () => {
      currentQuestion = 0;
      score = 0;
      renderQuizQuestion();
    });
  }

  const quizToSummaryBtn = document.getElementById("quizToSummaryBtn");
  if (quizToSummaryBtn) {
    quizToSummaryBtn.addEventListener("click", () => {
      showStep(2);
    });
  }

  const quizToLearningBtn = document.getElementById("quizToLearningBtn");
  if (quizToLearningBtn) {
    quizToLearningBtn.addEventListener("click", () => {
      renderLearning();
      showStep(3);
    });
  }

  const analyzeAgainBtn = document.getElementById("analyzeAgainBtn");
  if (analyzeAgainBtn) {
    analyzeAgainBtn.addEventListener("click", () => {
      selectedLanguage = null;
      selectedMode = null;
      currentQuestion = 0;
      score = 0;
      showStep(0);
    });
  }
}

function showError(message) {
  showStatus(message, true);
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.classList.remove("error");
}

function isValidResult(result) {
  if (!result || typeof result !== "object") return false;
  if (!result.english_summary || !result.irish_summary) return false;
  if (!Array.isArray(result.vocabulary) || result.vocabulary.length < 4) return false;
  if (!Array.isArray(result.quiz) || result.quiz.length < 3) return false;
  return true;
}

// ------------------ ANALYZE ------------------

analyzeBtn.addEventListener("click", async () => {
  analyzeBtn.disabled = true;
  showStatus("Analyzing page with AI...");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showError("No active tab available. Open a regular webpage and try again.");
    analyzeBtn.disabled = false;
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_PAGE" }, async (pageData) => {
    if (chrome.runtime.lastError) {
      console.error("runtime.lastError:", chrome.runtime.lastError.message);
      showError("Could not connect to page. Ensure the site is a regular web page and content script is allowed.");
      analyzeBtn.disabled = false;
      return;
    }

    if (!pageData || !pageData.title) {
      showError("No data received from page. Please navigate to a webpage with text and try again.");
      analyzeBtn.disabled = false;
      return;
    }

    try {
      const response = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pageData)
      });

      if (!response.ok) {
        let errorText;
        try {
          const errJson = await response.json();
          errorText = errJson?.details ? `${errJson.error} (${errJson.details})` : errJson?.error || response.statusText;
        } catch {
          errorText = await response.text();
        }

        console.error("Analyze API error", response.status, errorText);
        showError(`Server error: ${response.status} - ${errorText}`);
        analyzeBtn.disabled = false;
        return;
      }

      const result = await response.json();

      if (!isValidResult(result)) {
        console.error("Malformed analyze result", result);
        showError("Received invalid data format from AI. Please try again.");
        analyzeBtn.disabled = false;
        return;
      }

      fullData = result;
      quizData = result.quiz || [];
      currentQuestion = 0;
      score = 0;
      selectedLanguage = null;
      selectedMode = null;

      finalSummaryEl.innerHTML = `<div class="empty-state">Choose language and reading mode.</div>`;
      learningContentEl.innerHTML = `<div class="empty-state">Learning cards will appear after analysis.</div>`;
      quizListEl.innerHTML = `<div class="empty-state">Quiz will appear after analysis.</div>`;

      showStep(0);
      showStatus("Done.");
      analyzeBtn.disabled = false;
    } catch (error) {
      console.error("Analyze request failed", error);
      showError("Server error. Try again.");
      analyzeBtn.disabled = false;
    }
  });
});

// ------------------ GLOBAL BUTTONS ------------------

document.addEventListener("click", (e) => {
  if (e.target.matches("[data-lang]")) {
    selectedLanguage = e.target.dataset.lang;

    document.querySelectorAll("[data-lang]").forEach(btn => btn.classList.remove("selected"));
    e.target.classList.add("selected");

    setTimeout(() => {
      showStep(1);
    }, 250);
  }

  if (e.target.matches("[data-mode]")) {
    selectedMode = e.target.dataset.mode;

    document.querySelectorAll("[data-mode]").forEach(btn => btn.classList.remove("selected"));
    e.target.classList.add("selected");

    setTimeout(() => {
      renderFinalSummary();
      showStep(2);
    }, 250);
  }

  if (e.target.id === "backToLanguageBtn") {
    showStep(0);
  }

  if (e.target.id === "backToModeBtn") {
    showStep(1);
  }

  if (e.target.id === "backToSummaryBtn") {
    showStep(2);
  }

  if (e.target.id === "backToSummaryFromLearningBtn") {
    showStep(2);
  }

  if (e.target.id === "learnBtn") {
    renderLearning();
    showStep(3);
  }

  if (e.target.id === "toQuizBtn") {
    currentQuestion = 0;
    score = 0;
    renderQuizQuestion();
    showStep(4);
  }
});

// ------------------ INIT ------------------

setEmptyState();
showStep(0);