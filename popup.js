document.getElementById("summarize").addEventListener("click", handleSummarize);
document.getElementById("copy-btn").addEventListener("click", handleCopy);

// Apply saved theme on load
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(["darkModeEnabled"], ({ darkModeEnabled }) => {
    if (darkModeEnabled) {
      document.body.classList.add("dark-theme");
      document.getElementById("dark-mode-toggle").innerText = "Dark Mode";
    }
  });
});

// Dark mode toggle button
document.getElementById("dark-mode-toggle").addEventListener("click", () => {
  const body = document.body;
  const toggleBtn = document.getElementById("dark-mode-toggle");

  if (body.classList.contains("dark-theme")) {
    body.classList.remove("dark-theme");
    toggleBtn.innerText = "Light Mode On";
    chrome.storage.sync.set({ darkModeEnabled: false });
  } else {
    body.classList.add("dark-theme");
    toggleBtn.innerText = "Dark Mode On";
    chrome.storage.sync.set({ darkModeEnabled: true });
  }
});

async function handleSummarize() {
  const resultDiv = document.getElementById("result");
  const summaryType = document.getElementById("summary-type").value;

  resultDiv.innerHTML = '<div class="loading"><div class="loader"></div></div>';

  try {
    const { geminiApiKey } = await chrome.storage.sync.get("geminiApiKey");

    if (!geminiApiKey) {
      resultDiv.innerHTML = `<p class="error"> API key not found.<br>Set it in the extension options.</p>`;
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_ARTICLE_TEXT" });

    if (!response?.text) {
      resultDiv.innerHTML = `<p class="error"> Could not extract article text from this page.</p>`;
      return;
    }

    const summary = await getGeminiSummary(response.text, summaryType, geminiApiKey);
    resultDiv.innerText = summary;
  } catch (error) {
    console.error("Summarization error:", error);
    resultDiv.innerHTML = `<p class="error"> ${error.message || "Failed to generate summary."}</p>`;
  }
}

async function handleCopy() {
  const summaryText = document.getElementById("result").innerText.trim();
  if (!summaryText) return;

  try {
    await navigator.clipboard.writeText(summaryText);
    const copyBtn = document.getElementById("copy-btn");
    const originalText = copyBtn.innerText;

    copyBtn.innerText = " Copied!";
    copyBtn.disabled = true;
    setTimeout(() => {
      copyBtn.innerText = originalText;
      copyBtn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error("Clipboard error:", err);
    alert("Failed to copy summary.");
  }
}

async function getGeminiSummary(text, summaryType, apiKey) {
  const maxLength = 20000;
  const truncatedText =
    text.length > maxLength ? text.substring(0, maxLength) + "..." : text;

  const prompts = {
    brief: `Provide a concise summary (2-3 sentences) of this article:\n\n${truncatedText}`,
    detailed: `Provide a detailed summary of this article, covering key points and insights:\n\n${truncatedText}`,
    bullets: `Summarize this article in 5–7 bullet points. Use '- ' before each point:\n\n${truncatedText}`,
  };

  const prompt = prompts[summaryType] || prompts.brief;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "Gemini API request failed");
  }

  const data = await response.json();
  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    " No summary available."
  );
}