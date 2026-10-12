"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DM_Serif_Display, Libre_Franklin } from "next/font/google";
import { ArrowRight, ArrowUpRight, Search, Bookmark, Quote, Files } from "lucide-react";
import { KivoLogo } from "@/components/kivo-logo";
import styles from "./landing.module.css";

const displayFont = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});
const bodyFont = Libre_Franklin({
  variable: "--font-libre-franklin",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const workflow = [
  { Icon: Search, title: "Search the literature", copy: "Look across Crossref, arXiv, and Europe PMC in one search. Follow official source and PDF links." },
  { Icon: Quote, title: "Read with your sources close", copy: "Keep exact passages from an abstract or PDF, with the page number attached. Your evidence stays traceable." },
  { Icon: Files, title: "Make the work add up", copy: "Screen papers, compare findings, and build an argument with the evidence you collected." },
];

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) router.push("/workspace?q=" + encodeURIComponent(query.trim()));
  }

  return (
    <main className={`${styles.site} ${displayFont.variable} ${bodyFont.variable}`}>
      <a href="#landing-search" className="skip-link">Skip to search</a>
      <header className={styles.header}>
        <Link href="/" aria-label="Kivo home"><KivoLogo /></Link>
        <nav aria-label="Main navigation"><a href="#features">How it works</a><Link href="/workspace">Your workspace <ArrowUpRight size={15} /></Link></nav>
      </header>
      <section className={styles.hero} id="top">
        <div className={styles.bloom} aria-hidden="true">
          <video autoPlay muted loop playsInline preload="metadata"><source src="/kivo-media/flower.mp4" type="video/mp4" /></video>
        </div>
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>YOUR RESEARCH, IN FOCUS</p>
          <h1><span>Thousands of Papers</span><span>One Clear Path to</span><em>Discovery</em></h1>
          <p className={styles.intro}>Find the work. Follow the evidence.<br />Shape what comes next.</p>
          <form id="landing-search" onSubmit={submit} className={styles.search}>
            <label className={styles.searchInput}><Search size={20} /><span className="sr-only">Search research papers</span>
              <input value={query} onChange={event => setQuery(event.target.value)} maxLength={1000} placeholder="What are you researching?" required /></label>
            <button type="submit">Find papers <ArrowRight size={18} /></button>
          </form>
          <p className={styles.sources}>Crossref <span>/</span> arXiv <span>/</span> Europe PMC</p>
        </div>
      </section>
      <section id="features" className={styles.workflow}>
        <div className={styles.workflowHeading}><h2>A clear path through<br />the literature.</h2><p>Finding a paper is the beginning. Kivo keeps the rest of your research together.</p></div>
        <div className={styles.workflowList}>{workflow.map(({ Icon, title, copy }, index) => <article key={title}>
          <span className={styles.step}>{String(index + 1).padStart(2, "0")}</span>
          <div><h3>{title}</h3><p>{copy}</p></div><Icon size={25} strokeWidth={1.5} />
        </article>)}</div>
      </section>
      <section className={styles.local}>
        <Bookmark size={26} strokeWidth={1.5} />
        <div><h2>Your research, within reach.</h2><p>No account required. Papers, notes, and evidence are saved in this browser. Download a backup whenever you need one.</p></div>
        <Link href="/workspace">Open your workspace <ArrowRight size={17} /></Link>
      </section>
      <footer className={styles.footer}><KivoLogo /><p>Keep the source with the thought.</p><span>Built for the work of understanding.</span></footer>
    </main>
  );
}
