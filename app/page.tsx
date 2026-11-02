"use client";

import { useState } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const API = "https://mediavault-mpp4.onrender.com";

  async function searchMedia() {
    if (!query.trim()) {
      setMessage("Please enter something to search.");
      return;
    }

    setMessage("Searching...");

    try {
      const response = await fetch(
        API + "/search/ai?q=" + encodeURIComponent(query)
      );

      if (!response.ok) {
        throw new Error("Backend returned an error.");
      }

      const data = await response.json();
      setMessage(JSON.stringify(data, null, 2));
    } catch {
      setMessage("Could not connect to the backend. Check whether Render is running.");
    }
  }

  return (
    <main className="min-h-screen bg-[#080b12] px-6 py-20 text-white">
      <section className="mx-auto max-w-5xl">
        <h1 className="text-4xl font-bold">
          Media<span className="text-violet-400">Vault</span>
        </h1>

        <p className="mt-4 text-gray-400">
          Your personal AI-powered media discovery platform.
        </p>

        <h2 className="mt-16 text-5xl font-bold leading-tight">
          Find any memory.
          <br />
          <span className="text-violet-400">Just describe it.</span>
        </h2>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") searchMedia();
            }}
            placeholder="Search for cars, mountains, sunsets..."
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-5 py-4 outline-none"
          />

          <button
            onClick={searchMedia}
            className="rounded-xl bg-violet-600 px-6 py-4 font-semibold hover:bg-violet-500"
          >
            Search Media
          </button>
        </div>

        {message && (
          <pre className="mt-6 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-white/5 p-5 text-sm">
            {message}
          </pre>
        )}

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            ["AI Search", "Find media using natural-language descriptions."],
            ["Visual Discovery", "Explore your collection visually."],
            ["One Library", "Keep your media in one place."],
          ].map(([title, description]) => (
            <div
              key={title}
              className="rounded-xl border border-white/10 bg-white/5 p-6"
            >
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-gray-400">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}