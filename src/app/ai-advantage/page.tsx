'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import styles from './ai-advantage.module.css'

export default function AIAdvantagePage() {
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerToast = useCallback(() => {
    setShowToast(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setShowToast(false), 1800)
  }, [])

  const copyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text.trim()).then(() => {
      triggerToast()
    })
  }, [triggerToast])

  const handleCopyBtn = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget
    const block = btn.closest(`.${styles.promptBlock}, .${styles.promptBlockDark}`)
    const body = block?.querySelector('[data-prompt]')
    if (!body) return
    copyText(body.textContent || '')
    btn.textContent = 'copied!'
    btn.classList.add(styles.copied)
    setTimeout(() => {
      btn.textContent = 'copy'
      btn.classList.remove(styles.copied)
    }, 2200)
  }, [copyText])

  const handleClickCopy = useCallback((text: string, e: React.MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    copyText(text)
    const origBg = el.style.background
    const origBorder = el.style.borderColor
    el.style.background = 'rgba(74,222,128,.15)'
    el.style.borderColor = '#4ade80'
    setTimeout(() => {
      el.style.background = origBg
      el.style.borderColor = origBorder
    }, 800)
  }, [copyText])

  useEffect(() => {
    // ── PAGE FADE IN ─────────────────────────────────
    document.querySelector(`.${styles.page}`)?.classList.add(styles.pageVisible)

    // ── SMOOTH SCROLL NAV LINKS ──────────────────────
    const navEl = document.querySelector(`.${styles.stickyNav}`)
    const handleNavClick = (e: Event) => {
      const link = (e.target as HTMLElement).closest('a[href^="#"]')
      if (!link) return
      e.preventDefault()
      const href = link.getAttribute('href')
      if (!href) return
      const target = document.querySelector(href)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        window.history.pushState(null, '', href)
      }
    }
    navEl?.addEventListener('click', handleNavClick)

    // ── ACTIVE NAV ON SCROLL ─────────────────────────
    const sections = document.querySelectorAll('section[id]')
    const navLinks = document.querySelectorAll(`.${styles.stickyNav} a`)

    const navObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            navLinks.forEach((a) => a.classList.remove(styles.navActive))
            const active = document.querySelector(
              `.${styles.stickyNav} a[href="#${entry.target.id}"]`
            )
            if (active) active.classList.add(styles.navActive)
          }
        })
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )
    sections.forEach((s) => navObserver.observe(s))

    // ── FADE IN ON SCROLL ────────────────────────────
    const fadeEls = document.querySelectorAll(`.${styles.fadeTarget}`)
    const fadeObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.fadeVisible)
            fadeObserver.unobserve(entry.target)
          }
        })
      },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.1 }
    )
    fadeEls.forEach((el) => fadeObserver.observe(el))

    // ── BACK TO TOP VISIBILITY ───────────────────────
    const scrollHandler = () => {
      setShowBackToTop(window.scrollY > 600)
    }
    window.addEventListener('scroll', scrollHandler, { passive: true })

    return () => {
      navObserver.disconnect()
      fadeObserver.disconnect()
      navEl?.removeEventListener('click', handleNavClick)
      window.removeEventListener('scroll', scrollHandler)
    }
  }, [])

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className={styles.page}>
      {/* TOAST */}
      <div className={`${styles.toast} ${showToast ? styles.toastVisible : ''}`}>
        Copied to clipboard &#10003;
      </div>

      {/* HEADER */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <a href="https://www.wisdombi.ai" className={styles.logo}>
            <Image
              src="/images/logo-tight.png"
              alt="WisdomBi — Business Intelligence"
              width={200}
              height={100}
              className={styles.logoImg}
              priority
            />
          </a>
          <span className={styles.headerBadge}>The AI Advantage &middot; Session Reference</span>
        </div>
        <div className={styles.headerHero}>
          <div className={styles.heroLabel}>Session Reference &middot; Wisdom Consulting Group</div>
          <h1>
            The AI<br />
            <span className={styles.heroAccent}>Advantage</span>
          </h1>
          <div className={styles.heroRule} />
          <p>
            Every framework, prompt and model from today&apos;s session.
            Bookmark this &mdash; it&apos;s yours to keep and use.
          </p>
          <div className={styles.heroBtns}>
            <a href="/ai-advantage/AI_Advantage_Slides.pdf" download className={styles.btnPrimary}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download the slides
            </a>
            <a href="#system" className={styles.btnSecondary}>
              Explore the frameworks &#8594;
            </a>
          </div>
        </div>
        <div className={styles.heroPattern} />
      </header>

      {/* NAV */}
      <nav className={styles.stickyNav}>
        <div className={styles.navInner}>
          <ul>
            <li><a href="#system" className={styles.navActive}>System</a></li>
            <li><a href="#phase1">Phase 1</a></li>
            <li><a href="#phase2">Phase 2</a></li>
            <li><a href="#sarah">Sarah</a></li>
            <li><a href="#deeper">DEEPER</a></li>
            <li><a href="#plan">Plan</a></li>
            <li><a href="#levels">Levels</a></li>
            <li><a href="#tools">Tools</a></li>
            <li>
              <a href="/ai-advantage/AI_Advantage_Slides.pdf" download className={styles.navDownload}>
                &#8595; Slides
              </a>
            </li>
          </ul>
        </div>
        <div className={styles.navFade} />
      </nav>

      {/* MAIN */}
      <main className={styles.main}>

        {/* ── 01 THE COMPLETE SYSTEM ─────────────────────── */}
        <section id="system" className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>01</div>
            <div>
              <div className={styles.sectionEyebrow}>The Complete System</div>
              <h2>Three phases.<br />Used in order. Every time.</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <p className={styles.sectionIntro}>
              Each phase does a specific job. Skip one and the others don&apos;t work properly.
            </p>
          </div>

          {/* Phase cards */}
          <div className={styles.phaseGrid}>
            <div className={styles.phaseCard}>
              <div className={styles.phaseCardHead} style={{ background: 'var(--orange)' }}>
                <div className={styles.phaseCardSub}>Phase 1</div>
                <div className={styles.phaseCardTitle}>Unpack the Problem</div>
              </div>
              <div className={styles.phaseCardBody}>
                <div className={styles.phaseCardLabel} style={{ color: 'var(--orange)' }}>5-Layer Model</div>
                <div className={styles.phaseCardDesc}>Map the real problem before you ask for anything. You can&apos;t solve what you haven&apos;t properly seen.</div>
              </div>
            </div>
            <div className={styles.phaseCard}>
              <div className={styles.phaseCardHead} style={{ background: 'var(--teal)' }}>
                <div className={styles.phaseCardSub}>Phase 2</div>
                <div className={styles.phaseCardTitle}>Work With AI</div>
              </div>
              <div className={styles.phaseCardBody}>
                <div className={styles.phaseCardLabel} style={{ color: 'var(--teal-l)' }}>The C&#179; Method</div>
                <div className={styles.phaseCardDesc}>Clarity &middot; Curiosity &middot; Challenge. Three moves that produce results neither you nor AI reach alone.</div>
              </div>
            </div>
            <div className={styles.phaseCard}>
              <div className={styles.phaseCardHead} style={{ background: 'var(--green)' }}>
                <div className={styles.phaseCardSub}>Phase 3</div>
                <div className={styles.phaseCardTitle}>Go DEEPER</div>
              </div>
              <div className={styles.phaseCardBody}>
                <div className={styles.phaseCardLabel} style={{ color: 'var(--green)' }}>The DEEPER Framework</div>
                <div className={styles.phaseCardDesc}>
                  <strong style={{ color: 'var(--green)' }}>D</strong>iscover &middot;{' '}
                  <strong style={{ color: 'var(--green)' }}>E</strong>xplore &middot;{' '}
                  <strong style={{ color: 'var(--green)' }}>E</strong>valuate &middot;{' '}
                  <strong style={{ color: 'var(--green)' }}>P</strong>lan &middot;{' '}
                  <strong style={{ color: 'var(--green)' }}>E</strong>xecute &middot;{' '}
                  <strong style={{ color: 'var(--green)' }}>R</strong>efine
                </div>
              </div>
            </div>
          </div>

          {/* Key phrase */}
          <div className={styles.keyPhrase}>
            <div className={styles.keyPhraseLabel}>The one phrase to memorise</div>
            <div className={styles.keyPhraseText}>&ldquo;Before you suggest anything, ask me questions one at a time.&rdquo;</div>
            <div className={styles.keyPhraseSub}>This shifts AI from answering to investigating. Use it at the start of every important conversation.</div>
          </div>

        </section>

        {/* ── 02 PHASE 1: 5-LAYER MODEL ─────────────────── */}
        <section id="phase1" className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>02</div>
            <div>
              <div className={styles.sectionEyebrow}>Phase 1</div>
              <h2>The 5-Layer Model</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <p className={styles.sectionIntro}>
              Map the problem before asking for solutions. The breakthrough always happens at Layer 3.
            </p>
          </div>

          <div className={styles.layers}>
            {/* Layer 1 */}
            <div className={styles.layer}>
              <div className={styles.layerNum} style={{ background: '#DBEAFE', color: 'var(--teal)' }}>1</div>
              <div className={styles.layerBody}>
                <div className={`${styles.layerCard}`}>
                  <div className={styles.layerName} style={{ color: 'var(--teal)' }}>Symptom &mdash; What you notice</div>
                  <div className={styles.layerDesc}>The thing that shows up as a problem. Real &mdash; but not the problem itself.</div>
                  <div className={styles.layerAnswerLabel} style={{ color: 'var(--teal)' }}>Sarah&apos;s answer</div>
                  <div className={styles.layerAnswer} style={{ borderColor: 'var(--teal)', background: 'var(--teal-lt)', color: 'var(--text)' }}>
                    &ldquo;Compliance paperwork is eating my Monday mornings.&rdquo;
                  </div>
                  <div className={styles.layerPromptLabel}>Prompt for this layer</div>
                  <div className={styles.promptBlock}>
                    <div className={styles.promptHeader}>
                      <span className={styles.promptLabel}>Layer 1</span>
                      <button className={styles.copyBtn} onClick={handleCopyBtn}>copy</button>
                    </div>
                    <div className={styles.promptBody} data-prompt>&ldquo;The biggest problem I keep running into is [describe it]. It affects [who] and happens [how often]. Don&apos;t solve it yet &mdash; ask me questions to understand it better.&rdquo;</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 2 */}
            <div className={styles.layer}>
              <div className={styles.layerNum} style={{ background: '#DBEAFE', color: 'var(--teal)' }}>2</div>
              <div className={styles.layerBody}>
                <div className={styles.layerCard}>
                  <div className={styles.layerName} style={{ color: 'var(--teal)' }}>Process &mdash; What&apos;s actually happening</div>
                  <div className={styles.layerDesc}>Map the steps. Who does what, when, using which tools. Look for handoffs and gaps.</div>
                  <div className={styles.layerAnswerLabel} style={{ color: 'var(--teal)' }}>Sarah&apos;s answer</div>
                  <div className={styles.layerAnswer} style={{ borderColor: 'var(--teal)', background: 'var(--teal-lt)', color: 'var(--text)' }}>
                    &ldquo;Certificates tracked in a spreadsheet. Inductions logged manually. Expiries not flagged anywhere.&rdquo;
                  </div>
                  <div className={styles.layerPromptLabel}>Prompt for this layer</div>
                  <div className={styles.promptBlock}>
                    <div className={styles.promptHeader}>
                      <span className={styles.promptLabel}>Layer 2</span>
                      <button className={styles.copyBtn} onClick={handleCopyBtn}>copy</button>
                    </div>
                    <div className={styles.promptBody} data-prompt>&ldquo;I&apos;m going to describe how [this process] works, step by step. After I&apos;m done, map it back as a numbered sequence and flag where you see manual steps, handoffs, or gaps.&rdquo;</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 3 — STAR */}
            <div className={styles.layer}>
              <div className={`${styles.layerNum} ${styles.layerNumHighlight}`} style={{ background: '#FEF3C7', color: 'var(--gold)' }}>3</div>
              <div className={styles.layerBody}>
                <div className={`${styles.layerCard} ${styles.layerCardStar}`}>
                  <div className={styles.layerName} style={{ color: 'var(--gold)' }}>
                    Constraint &mdash; Where it breaks down
                    <span className={styles.starBadge}>Key Layer &#9733;</span>
                  </div>
                  <div className={styles.layerDesc}>The specific point where it fails. Name this precisely &mdash; the solution designs itself.</div>
                  <div className={styles.layerAnswerLabel} style={{ color: 'var(--gold)' }}>Sarah&apos;s answer</div>
                  <div className={styles.layerAnswer} style={{ borderColor: 'var(--gold)', background: '#FEF9EC', color: 'var(--text)' }}>
                    &ldquo;No single owner. Whoever is around does it. Records live in three different places.&rdquo;
                  </div>
                  <div className={styles.layerPromptLabel}>Prompt for this layer</div>
                  <div className={styles.promptBlock}>
                    <div className={styles.promptHeader}>
                      <span className={styles.promptLabel}>Layer 3 &#9733;</span>
                      <button className={styles.copyBtn} style={{ color: 'var(--gold)', borderColor: 'rgba(232,160,32,.4)' }} onClick={handleCopyBtn}>copy</button>
                    </div>
                    <div className={styles.promptBody} data-prompt>&ldquo;I think the real bottleneck is [your best guess]. Push back on that &mdash; is that really the root constraint? Restate it in one sentence I can act on.&rdquo;</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 4 */}
            <div className={styles.layer}>
              <div className={styles.layerNum} style={{ background: '#FEE2E2', color: 'var(--red)' }}>4</div>
              <div className={styles.layerBody}>
                <div className={styles.layerCard}>
                  <div className={styles.layerName} style={{ color: 'var(--red)' }}>Cost &mdash; What not solving it costs</div>
                  <div className={styles.layerDesc}>Vague cost = low urgency = no action. Quantify in time, money or risk.</div>
                  <div className={styles.layerAnswerLabel} style={{ color: 'var(--red)' }}>Sarah&apos;s answer</div>
                  <div className={styles.layerAnswer} style={{ borderColor: 'var(--red)', background: '#FEF2F2', color: 'var(--text)' }}>
                    &ldquo;2 hours every Monday. Two near-misses last year. If we get audited this month &mdash; we fail.&rdquo;
                  </div>
                  <div className={styles.layerPromptLabel}>Prompt for this layer</div>
                  <div className={styles.promptBlock}>
                    <div className={styles.promptHeader}>
                      <span className={styles.promptLabel}>Layer 4</span>
                      <button className={styles.copyBtn} style={{ color: 'var(--red)', borderColor: 'rgba(192,57,43,.3)' }} onClick={handleCopyBtn}>copy</button>
                    </div>
                    <div className={styles.promptBody} data-prompt>&ldquo;This costs me roughly [estimate] in [time/money/risk] per [week/month]. Help me be precise &mdash; ask about costs I might be missing, then summarise the total impact.&rdquo;</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 5 */}
            <div className={styles.layer}>
              <div className={styles.layerNum} style={{ background: 'var(--border)', color: 'var(--text)' }}>5</div>
              <div className={styles.layerBody}>
                <div className={styles.layerCard}>
                  <div className={styles.layerName} style={{ color: 'var(--text)' }}>Owner &mdash; Why it hasn&apos;t been solved</div>
                  <div className={styles.layerDesc}>Who has the problem and why does it persist? This shapes what solution will actually stick.</div>
                  <div className={styles.layerAnswerLabel} style={{ color: 'var(--text-muted)' }}>Sarah&apos;s answer</div>
                  <div className={styles.layerAnswer} style={{ borderColor: 'var(--text-muted)', background: '#F8F9FA', color: 'var(--text)' }}>
                    &ldquo;Technically me &mdash; but the solution needs to run without me chasing it every week.&rdquo;
                  </div>
                  <div className={styles.layerPromptLabel}>Prompt for this layer</div>
                  <div className={styles.promptBlock}>
                    <div className={styles.promptHeader}>
                      <span className={styles.promptLabel}>Layer 5</span>
                      <button className={styles.copyBtn} style={{ color: 'var(--text-muted)', borderColor: 'rgba(107,114,128,.3)' }} onClick={handleCopyBtn}>copy</button>
                    </div>
                    <div className={styles.promptBody} data-prompt>&ldquo;This problem has existed for [timeframe]. The reason it hasn&apos;t been solved is [honest assessment]. What does a solution need to look like to actually get used &mdash; not just built?&rdquo;</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Test box */}
          <div className={styles.testBox}>
            <div className={styles.testBoxLabel}>The test at every layer</div>
            <div className={styles.testBoxText}>&ldquo;If this was solved &mdash; what would actually change?&rdquo;</div>
            <div className={styles.testBoxSub}>If the answer is vague, you&apos;re still at the symptom. Keep going.</div>
          </div>

          {/* Master prompt */}
          <h3 style={{ fontWeight: 800, fontSize: '18px', color: 'var(--navy)', marginBottom: '12px' }}>Phase 1 Master Prompt</h3>
          <div className={styles.promptBlock}>
            <div className={styles.promptHeader}>
              <span className={styles.promptLabel}>Phase 1 Master Prompt &mdash; screenshot this</span>
              <button className={styles.copyBtn} onClick={handleCopyBtn}>copy</button>
            </div>
            <div className={styles.promptBody} data-prompt>{`I want to unpack a problem in my business. Don't suggest solutions yet.

Work through these 5 layers with me, one at a time. Ask me ONE question per layer, wait for my answer, then move to the next. After all 5, restate the real problem in 2 sentences I would agree are exactly right.

Layer 1 - SYMPTOM:    Ask me what problem I keep running into and who it affects.
Layer 2 - PROCESS:    Ask me to describe what actually happens, step by step.
Layer 3 - CONSTRAINT: Ask me where it breaks down and why it keeps happening.
Layer 4 - COST:       Ask me what it costs in time, money or risk — be specific.
Layer 5 - OWNER:      Ask me who should own this and why it hasn't been fixed yet.

Start with Layer 1 now.`}</div>
          </div>
        </section>

        {/* ── 03 PHASE 2: C3 METHOD ──────────────────────── */}
        <section id="phase2" className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>03</div>
            <div>
              <div className={styles.sectionEyebrow}>Phase 2</div>
              <h2>The C&#179; Method</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <p className={styles.sectionIntro}>
              Three moves. Used together, they produce results neither you nor AI would reach alone.
            </p>
          </div>

          {/* C3 grid */}
          <div className={styles.c3Grid}>
            {/* C1 Clarity */}
            <div className={styles.c3Card}>
              <div className={styles.c3CardHead} style={{ background: 'var(--teal)' }}>
                <span className={styles.c3Badge}>C&#185;</span>
                <span className={styles.c3Title}>Clarity</span>
              </div>
              <div className={styles.c3Sub}>Load the context</div>
              <div className={styles.c3Items}>
                <div className={styles.c3Item} onClick={(e) => handleClickCopy("I'm a [role] at a [business]. Here's my problem...", e)}>
                  &ldquo;I&apos;m a [role]. Here&apos;s my problem...&rdquo;
                </div>
                <div className={styles.c3Item} onClick={(e) => handleClickCopy("Here's the current process step by step...", e)}>
                  &ldquo;Here&apos;s the current process step by step...&rdquo;
                </div>
                <div className={styles.c3Item} onClick={(e) => handleClickCopy("The bottleneck is...", e)}>
                  &ldquo;The bottleneck is...&rdquo;
                </div>
                <div className={styles.c3Item} onClick={(e) => handleClickCopy("The tools we already use are...", e)}>
                  &ldquo;The tools we already use are...&rdquo;
                </div>
              </div>
            </div>

            {/* C2 Curiosity */}
            <div className={styles.c3Card}>
              <div className={styles.c3CardHead} style={{ background: 'var(--orange)' }}>
                <span className={styles.c3Badge}>C&#178;</span>
                <span className={styles.c3Title}>Curiosity</span>
              </div>
              <div className={styles.c3Sub}>Let AI investigate</div>
              <div className={styles.c3Items}>
                <div className={`${styles.c3Item} ${styles.c3ItemStar}`} onClick={(e) => handleClickCopy("Before answering, ask me questions one at a time", e)}>
                  &#9733; &ldquo;Before answering, ask me questions one at a time&rdquo;
                </div>
                <div className={styles.c3Item} onClick={(e) => handleClickCopy("What am I not thinking about?", e)}>
                  &ldquo;What am I not thinking about?&rdquo;
                </div>
                <div className={styles.c3Item} onClick={(e) => handleClickCopy("What would an expert do differently?", e)}>
                  &ldquo;What would an expert do differently?&rdquo;
                </div>
                <div className={styles.c3Item} onClick={(e) => handleClickCopy("Give me 3 options and explain the trade-offs", e)}>
                  &ldquo;Give me 3 options and explain the trade-offs&rdquo;
                </div>
              </div>
            </div>

            {/* C3 Challenge */}
            <div className={styles.c3Card}>
              <div className={styles.c3CardHead} style={{ background: 'var(--green)' }}>
                <span className={styles.c3Badge}>C&#179;</span>
                <span className={styles.c3Title}>Challenge</span>
              </div>
              <div className={styles.c3Sub}>Push back &mdash; don&apos;t settle</div>
              <div className={styles.c3Items}>
                <div className={styles.c3Item} onClick={(e) => handleClickCopy("What are the risks or edge cases?", e)}>
                  &ldquo;What are the risks or edge cases?&rdquo;
                </div>
                <div className={styles.c3Item} onClick={(e) => handleClickCopy("Rate this out of 10. Explain why. Now make it a 10.", e)}>
                  &ldquo;Rate this out of 10. Explain why. Now make it a 10.&rdquo;
                </div>
                <div className={styles.c3Item} onClick={(e) => handleClickCopy("What would you change if starting from scratch?", e)}>
                  &ldquo;What would you change if starting from scratch?&rdquo;
                </div>
                <div className={styles.c3Item} onClick={(e) => handleClickCopy("Poke holes in this. What's missing?", e)}>
                  &ldquo;Poke holes in this. What&apos;s missing?&rdquo;
                </div>
              </div>
            </div>
          </div>

          {/* Phase 2 Prompt */}
          <h3 style={{ fontWeight: 700, fontSize: '17px', color: 'var(--navy)', marginBottom: '12px' }}>Phase 2 Prompt &mdash; send immediately after Phase 1</h3>
          <div className={`${styles.promptBlock} ${styles.promptBlockDark}`}>
            <div className={`${styles.promptHeader} ${styles.promptHeaderDark}`}>
              <span className={`${styles.promptLabel} ${styles.promptLabelDark}`}>Phase 2 Prompt</span>
              <button className={styles.copyBtn} onClick={handleCopyBtn}>copy</button>
            </div>
            <div className={`${styles.promptBody} ${styles.promptBodyDark}`} data-prompt>
              <span className={styles.promptBoldDark}>Good. Before you suggest any solutions &mdash;</span>{'\n\n'}
              <span className={styles.promptMutedDark}>Summarise back to me what you&apos;ve understood about my problem so far.{'\n\n'}Then ask me anything you&apos;re still not sure about, one question at a time.{'\n\n'}Once you feel confident you understand it &mdash; restate the real problem in 2 sentences I&apos;d agree are exactly right.{'\n\n'}</span>
              <span className={styles.promptBoldDark}>Only then ask me if you can start suggesting solutions.</span>
            </div>
          </div>

          {/* Plan Prompt */}
          <h3 style={{ fontWeight: 700, fontSize: '17px', color: 'var(--navy)', margin: '24px 0 12px' }}>Plan Prompt &mdash; send once the solution is agreed</h3>
          <div className={`${styles.promptBlock} ${styles.promptBlockDark}`}>
            <div className={`${styles.promptHeader} ${styles.promptHeaderDark}`}>
              <span className={`${styles.promptLabel} ${styles.promptLabelDark}`}>Plan Prompt</span>
              <button className={styles.copyBtn} onClick={handleCopyBtn}>copy</button>
            </div>
            <div className={`${styles.promptBody} ${styles.promptBodyDark}`} data-prompt>
              <span className={styles.promptBoldDark}>Good. We&apos;ve agreed on the solution.</span>{'\n\n'}
              <span className={styles.promptMutedDark}>Now help me build a step-by-step implementation plan.{'\n\n'}Give me:{'\n'}</span>
              <span className={styles.promptAccent}>1. </span><span className={styles.promptMutedDark}>The agreed solution in one sentence.{'\n'}</span>
              <span className={styles.promptAccent}>2. </span><span className={styles.promptMutedDark}>The steps to implement it &mdash; in order, with who does what.{'\n'}</span>
              <span className={styles.promptAccent}>3. </span><span className={styles.promptMutedDark}>What done looks like &mdash; specific and measurable in 30 days.{'\n'}</span>
              <span className={styles.promptAccent}>4. </span><span className={styles.promptMutedDark}>The first action I can take this week.{'\n\n'}</span>
              <span className={styles.promptBoldDark}>Keep it practical. I need to be able to hand this to someone on Monday.</span>
            </div>
          </div>

          {/* Stress tests */}
          <h3 style={{ fontWeight: 700, fontSize: '17px', color: 'var(--navy)', margin: '24px 0 8px' }}>Stress-test prompts</h3>
          <div className={styles.stressGrid}>
            {[
              { display: '"Rate this out of 10. What would make it a 10?"', copy: 'Rate this solution out of 10. What would make it a 10?' },
              { display: '"What are you assuming that might not be true?"', copy: 'What are you assuming about my business that might not be true?' },
              { display: '"If I could only build one thing first — which and why?"', copy: 'If I could only build one thing first — which one and why?' },
              { display: '"What would make this fail?"', copy: 'What would make this fail?' },
              { display: '"What have I not asked that I should have?"', copy: 'What have I not asked you that I should have?' },
              { display: '"What\'s the simplest version that still solves this?"', copy: "What's the simplest version of this that would still solve the problem?" },
            ].map((item, i) => (
              <div
                key={i}
                className={styles.stressCard}
                onClick={(e) => handleClickCopy(item.copy, e)}
              >
                {item.display}
              </div>
            ))}
          </div>
        </section>

        {/* ── 04 SARAH'S STORY ───────────────────────────── */}
        <section id="sarah" className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>04</div>
            <div>
              <div className={styles.sectionEyebrow}>The Example</div>
              <h2>Sarah&apos;s story.</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <p className={styles.sectionIntro}>
              Every framework demonstrated through a real problem. Here&apos;s the full arc.
            </p>
          </div>

          {/* Profile */}
          <div className={styles.sarahProfile}>
            <div className={styles.sarahRow}><span className={styles.sarahLabel}>Her role</span><span className={styles.sarahValue}>Office manager. Trades business. 25 staff, subcontractors rotating in and out.</span></div>
            <div className={styles.sarahRow}><span className={styles.sarahLabel}>Her problem</span><span className={styles.sarahValue}>Compliance. Certificates expiring. Inductions not logged. Spreadsheet nobody trusts.</span></div>
            <div className={styles.sarahRow}><span className={styles.sarahLabel}>Her week</span><span className={styles.sarahValue}>Every Monday morning &mdash; two hours &mdash; before she&apos;d started anything else. Three years.</span></div>
            <div className={styles.sarahRow}><span className={styles.sarahLabel}>Her attempts</span><span className={styles.sarahValue}>Tried to fix it twice. Both times it collapsed. Back to the spreadsheet both times.</span></div>
          </div>

          <h3 style={{ fontWeight: 800, fontSize: '18px', color: 'var(--navy)', marginBottom: '20px' }}>The C&#179; conversation</h3>

          {/* C1 Clarity */}
          <div className={styles.conversation}>
            <div className={styles.chatHeader}>
              <span className={styles.chatBadge} style={{ background: 'var(--teal)' }}>C&#185; Clarity</span>
              <span className={styles.chatTitle}>Sarah loads context before asking for anything</span>
            </div>
            <div className={styles.chatWindow}>
              <div className={styles.chatBar}>
                <span className={styles.chatDot} style={{ background: '#EF4444' }} />
                <span className={styles.chatDot} style={{ background: '#F59E0B' }} />
                <span className={styles.chatDot} style={{ background: '#10B981' }} />
                AI
              </div>
              <div className={styles.chatBody}>
                <div className={styles.bubbleUser}>
                  I&apos;m an office manager at a trades business &mdash; 25 staff, subcontractors in and out.<br /><br />
                  Compliance is a constant headache. No single owner, records in three places, certificates expire without warning.<br /><br />
                  <strong>Before you suggest anything, ask me questions one at a time until you understand what&apos;s actually going wrong.</strong>
                </div>
              </div>
            </div>
            <div className={styles.chatNote} style={{ borderColor: 'var(--teal)', color: 'var(--teal)' }}>
              Role + context loaded. Constraint named upfront. Sarah hands control to AI &mdash; not asking for a solution, asking AI to investigate.
            </div>
          </div>

          {/* C2 Curiosity */}
          <div className={styles.conversation}>
            <div className={styles.chatHeader}>
              <span className={styles.chatBadge} style={{ background: 'var(--orange)' }}>C&#178; Curiosity</span>
              <span className={styles.chatTitle}>AI leads. Sarah answers &mdash; doesn&apos;t jump to solutions.</span>
            </div>
            <div className={styles.chatWindow}>
              <div className={styles.chatBar}>
                <span className={styles.chatDot} style={{ background: '#EF4444' }} />
                <span className={styles.chatDot} style={{ background: '#F59E0B' }} />
                <span className={styles.chatDot} style={{ background: '#10B981' }} />
                AI
              </div>
              <div className={styles.chatBody}>
                <div className={styles.bubbleAI}>
                  <strong>Before I suggest anything</strong> &mdash; when a certificate lapses without anyone catching it, what actually happens? Does the worker stop? Does a supervisor step in? Or does it quietly slip through?
                </div>
                <div className={styles.bubbleUser}>
                  Honestly? It slips through. We&apos;ve had two subcontractors on site with expired white cards in the last six months. We didn&apos;t know until an audit.
                </div>
                <div className={styles.bubbleAI}>
                  <strong>That&apos;s important. Second question:</strong> when someone is responsible for checking certificates, who is it &mdash; and do they have a reliable way to see expiry dates, or are they manually checking each person?
                </div>
              </div>
            </div>
            <div className={styles.chatNote} style={{ borderColor: 'var(--orange)', color: 'var(--orange)' }}>
              AI is building a picture &mdash; not generating solutions. Each question goes one level deeper.
            </div>
          </div>

          {/* The Trap */}
          <div className={styles.conversation}>
            <div className={styles.chatHeader}>
              <span className={styles.chatBadge} style={{ background: 'var(--red)' }}>&#9888; The Trap</span>
              <span className={styles.chatTitle}>AI gives an answer. Confident &mdash; but wrong. Most people stop here.</span>
            </div>
            <div className={styles.chatWindow}>
              <div className={styles.chatBar}>
                <span className={styles.chatDot} style={{ background: '#EF4444' }} />
                <span className={styles.chatDot} style={{ background: '#F59E0B' }} />
                <span className={styles.chatDot} style={{ background: '#10B981' }} />
                AI
              </div>
              <div className={styles.chatBody}>
                <div className={`${styles.bubbleAI} ${styles.bubbleWarn}`}>
                  <div className={styles.bubbleWarnLabel}>&#9888; Most people stop here.</div>
                  <strong>Based on what you&apos;ve told me:</strong><br /><br />
                  1. Create a shared Google Sheet with all certificates and expiry dates, colour-coded by status.<br />
                  2. Set up Google Calendar alerts 30 days before each expiry.<br />
                  3. Assign one person as &apos;compliance owner.&apos;
                </div>
              </div>
            </div>
            <div className={styles.chatNote} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
              <strong>Confident. Not correct.</strong> Sarah has tried the Google Sheet twice. It works for a month then collapses. Only she can spot this &mdash; which is exactly why Challenge matters.
            </div>
          </div>

          {/* C3 Challenge */}
          <div className={styles.conversation}>
            <div className={styles.chatHeader}>
              <span className={styles.chatBadge} style={{ background: 'var(--green)' }}>C&#179; Challenge</span>
              <span className={styles.chatTitle}>Sarah pushes back. AI changes direction entirely.</span>
            </div>
            <div className={styles.chatWindow}>
              <div className={styles.chatBar}>
                <span className={styles.chatDot} style={{ background: '#EF4444' }} />
                <span className={styles.chatDot} style={{ background: '#F59E0B' }} />
                <span className={styles.chatDot} style={{ background: '#10B981' }} />
                AI
              </div>
              <div className={styles.chatBody}>
                <div className={styles.bubbleUser}>
                  We&apos;ve tried the Google Sheet twice. It works for a month then nobody maintains it. The problem isn&apos;t the tool &mdash; it&apos;s that compliance gets deprioritised the moment anyone is busy. <strong>What am I not thinking about?</strong>
                </div>
                <div className={styles.bubbleAI}>
                  <strong>That&apos;s a critical distinction &mdash; thank you for pushing back.</strong><br /><br />
                  If manual maintenance always fails under pressure, the system can&apos;t rely on human remembering. Is there a point in your existing workflow &mdash; onboarding, site sign-in, invoicing &mdash; where compliance status is already checked? Because the answer is to embed it there, not add a separate process.
                </div>
              </div>
            </div>
            <div className={styles.chatNote} style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>
              One push back. AI changed direction entirely. The real solution is now reachable.
            </div>
          </div>

          {/* Restate + Result */}
          <div className={styles.restateBox}>
            <div className={styles.restateContent}>
              <div className={styles.restateLabel}>AI restates &mdash; Sarah confirms</div>
              <div className={styles.restateQuote}>
                &ldquo;The real problem is that compliance checking only happens when someone remembers &mdash; and under pressure, nobody does. A new tool won&apos;t fix that. The solution must be automatic and embedded in an existing workflow.&rdquo;
              </div>
              <div className={styles.restateConfirm}>
                &ldquo;Yes. That&apos;s exactly it. That&apos;s what I&apos;ve been trying to say for three years.&rdquo;
              </div>
            </div>
            <div className={styles.resultGrid}>
              <div className={styles.resultItem}>
                <div className={styles.resultLabel} style={{ color: 'var(--red)' }}>She asked for</div>
                <div className={styles.resultBody}>A better checklist. Something to replace the spreadsheet.</div>
              </div>
              <div className={styles.resultItem}>
                <div className={styles.resultLabel} style={{ color: 'var(--orange)' }}>She needed</div>
                <div className={styles.resultBody}>A system that doesn&apos;t depend on anyone remembering.</div>
              </div>
              <div className={styles.resultItem}>
                <div className={styles.resultLabel} style={{ color: '#4ade80' }}>She got</div>
                <div className={styles.resultBody}>Compliance embedded into site sign-in &mdash; automatic, no maintenance burden.</div>
              </div>
            </div>
          </div>

          <div className={styles.resultBanner}>
            <div>
              <div className={styles.resultBannerTitle}>Monday mornings: 2 hours &#8594; 20 minutes.</div>
              <div className={styles.resultBannerSub}>Three years. Same problem. Fixed in one session using the C&#179; method.</div>
            </div>
            <div className={styles.resultBannerTag}>Same method.<br />Any problem.</div>
          </div>
        </section>

        {/* ── 05 PHASE 3: GO DEEPER ──────────────────────── */}
        <section id="deeper" className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>05</div>
            <div>
              <div className={styles.sectionEyebrow}>Phase 3</div>
              <h2>Go DEEPER.</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <p className={styles.sectionIntro}>
              Six steps. The framework that turns a conversation into a result &mdash; and compounds every time you use it.
            </p>
          </div>

          <div className={styles.deeperTimeline}>
            {[
              { letter: 'D', word: 'iscover', color: 'var(--orange)', phase: 'Phase 1 — 5-Layer Model', desc: 'Surface what\u2019s actually going on before you ask for anything.', sarah: 'Problem isn\u2019t the spreadsheet \u2014 it\u2019s ownership.' },
              { letter: 'E', word: 'xplore', color: 'var(--teal-l)', phase: 'Phase 2 — C\u00B9 + C\u00B2', desc: 'Load context. Let AI ask questions. Don\u2019t jump to answers.', sarah: 'AI asked 2 questions. Surfaced near-misses Sarah hadn\u2019t counted.' },
              { letter: 'E', word: 'valuate', color: '#4ade80', phase: 'Phase 2 — C\u00B3', desc: 'Push back on the first answer. Agree the solution together.', sarah: 'Pushed back on Google Sheet. AI changed direction entirely.' },
              { letter: 'P', word: 'lan', color: '#B08FD0', phase: 'Plan Prompt', desc: 'AI generates implementation steps from the agreed solution.', sarah: 'AI produced the plan. Sarah confirmed in two minutes.' },
              { letter: 'E', word: 'xecute', color: '#5BAFD0', phase: 'Build', desc: 'One more AI session. Built Thursday. Running Monday.', sarah: 'Compliance embedded in site sign-in. Zero manual checks.' },
              { letter: 'R', word: 'efine', color: 'var(--gold)', phase: 'Iterate', desc: 'What worked? What to improve? Go again \u2014 deeper each time.', sarah: 'Month 1: AI Project. Month 3: live web tool.' },
            ].map((step, i) => (
              <div key={i} className={styles.deeperRow}>
                <div className={styles.deeperRowLeft}>
                  <div className={styles.deeperRowLetter} style={{ color: step.color }}>{step.letter}</div>
                  <div className={styles.deeperRowWord} style={{ color: step.color }}>{step.word}</div>
                </div>
                <div className={styles.deeperRowMiddle}>
                  <div className={styles.deeperRowPhase}>{step.phase}</div>
                  <div className={styles.deeperRowDesc}>{step.desc}</div>
                </div>
                <div className={styles.deeperRowSarah}>
                  <div className={styles.deeperRowSarahLabel}>Sarah</div>
                  <div className={styles.deeperRowSarahText}>{step.sarah}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.quoteStrip}>
            <div className={styles.quoteText} style={{ color: 'var(--teal)', fontWeight: 800 }}>When you go DEEPER with AI &mdash; the results are 10x.</div>
          </div>
        </section>

        {/* ── 06 THE PLAN ────────────────────────────────── */}
        <section id="plan" className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>06</div>
            <div>
              <div className={styles.sectionEyebrow}>The Plan</div>
              <h2>Sarah&apos;s Implementation Plan.</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <p className={styles.sectionIntro}>
              Generated by AI from the conversation. Confirmed by Sarah in two minutes. This is what the P in DEEPER produces.
            </p>
          </div>

          <div className={styles.planGrid}>
            <div className={styles.planCard}>
              <div className={styles.planCardHead} style={{ background: 'var(--purple)' }}>
                <div className={styles.planCardNum}>1</div>
                <div className={styles.planCardTitle}>The Solution</div>
              </div>
              <div className={styles.planCardBody}>
                <div className={styles.planCardTag}>Agreed solution &mdash; in one sentence</div>
                <div className={styles.planCardContent}>Compliance status checked automatically at site sign-in. If a certificate is expired or missing &mdash; the worker cannot complete sign-in. No manual checking required.</div>
              </div>
            </div>

            <div className={styles.planCard}>
              <div className={styles.planCardHead} style={{ background: 'var(--teal)' }}>
                <div className={styles.planCardNum}>2</div>
                <div className={styles.planCardTitle}>The Steps</div>
              </div>
              <div className={styles.planCardBody}>
                <div className={styles.planCardTag}>In order &mdash; with owners and timelines</div>
                <div className={styles.planCardContent}>
                  <strong>Step 1:</strong> Map sign-in workflow with IT. Identify trigger point. <em style={{ color: 'var(--text-muted)' }}>Owner: Sarah + IT. Week 1.</em><br /><br />
                  <strong>Step 2:</strong> Connect certificate database to sign-in system. <em style={{ color: 'var(--text-muted)' }}>Owner: IT. Weeks 2-3.</em><br /><br />
                  <strong>Step 3:</strong> Pilot with 3 subcontractors before full rollout. <em style={{ color: 'var(--text-muted)' }}>Owner: Sarah. Week 4.</em>
                </div>
              </div>
            </div>

            <div className={styles.planCard}>
              <div className={styles.planCardHead} style={{ background: 'var(--orange)' }}>
                <div className={styles.planCardNum}>3</div>
                <div className={styles.planCardTitle}>Done When</div>
              </div>
              <div className={styles.planCardBody}>
                <div className={styles.planCardTag}>Specific and measurable &mdash; she can check this on any Monday</div>
                <div className={styles.planCardContent}>Zero manual certificate checks on Monday mornings. System flags expiries automatically. Zero near-misses on site.</div>
              </div>
            </div>

            <div className={styles.planCard}>
              <div className={styles.planCardHead} style={{ background: 'var(--green)' }}>
                <div className={styles.planCardNum}>4</div>
                <div className={styles.planCardTitle}>First Action This Week</div>
              </div>
              <div className={styles.planCardBody}>
                <div className={styles.planCardTag}>One action &mdash; this week &mdash; not &apos;look into it&apos;</div>
                <div className={styles.planCardContent}>Book 30 minutes with IT lead. Share this plan. Get a start date.</div>
              </div>
            </div>
          </div>

          <div className={styles.planNote}>
            <div className={styles.planNoteTitle}>A plan isn&apos;t a project plan.</div>
            <div className={styles.planNoteText}>It&apos;s a commitment &mdash; to the solution, the first step, and the one thing that could stop you.</div>
          </div>
        </section>

        {/* ── 07 DOWNLOAD BANNER ─────────────────────────── */}
        <section className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.downloadBanner}>
            <div>
              <h3>Download the full slide deck</h3>
              <p>35 slides covering the complete system &mdash; all frameworks, prompts, Sarah&apos;s story and the DEEPER framework. Ready to use in your own presentations.</p>
            </div>
            <a href="/ai-advantage/AI_Advantage_Slides.pdf" download className={styles.downloadBtn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download slides (.pdf)
            </a>
          </div>
        </section>

        {/* ── 08 THREE LEVELS ────────────────────────────── */}
        <section id="levels" className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>07</div>
            <div>
              <div className={styles.sectionEyebrow}>Where You Go From Here</div>
              <h2>Three levels.<br />One method.</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <p className={styles.sectionIntro}>
              Find your level. The row above it is your next 90 days.
            </p>
          </div>

          <div className={styles.levelRows}>
            <div className={styles.levelRow}>
              <div className={styles.levelLabel} style={{ background: 'var(--teal)' }}>
                BEGINNER
                <span className={styles.levelLabelSub}>Haven&apos;t started, or tried with mixed results</span>
              </div>
              <div className={styles.levelBody}>
                <div className={styles.levelNext}>&#8594; Use the Phase 2 prompt on one real problem this week.</div>
                <div className={styles.levelEg}>One good conversation &middot; One problem solved &middot; One process improved</div>
              </div>
              <div className={styles.levelTools}>
                <span className={styles.toolChip} style={{ background: 'var(--teal)', color: '#FFFFFF' }}>Claude.ai</span>
                <span className={styles.toolChip} style={{ background: '#DBEAFE', color: 'var(--teal)' }}>Phase 1 + 2 prompts</span>
              </div>
            </div>

            <div className={styles.levelRow}>
              <div className={styles.levelLabel} style={{ background: 'var(--orange)' }}>
                INTERMEDIATE
                <span className={styles.levelLabelSub}>Using AI regularly, want deeper results</span>
              </div>
              <div className={styles.levelBody}>
                <div className={styles.levelNext}>&#8594; Create a Project that knows your business, clients and voice.</div>
                <div className={styles.levelEg}>Proposal writer &middot; Quoting tool &middot; Compliance tracker &middot; Zapier automations</div>
              </div>
              <div className={styles.levelTools}>
                <span className={styles.toolChip} style={{ background: 'var(--orange)', color: '#FFFFFF' }}>Claude Projects</span>
                <span className={styles.toolChip} style={{ background: '#FEF3C7', color: 'var(--orange)' }}>Claude Code</span>
                <span className={styles.toolChip} style={{ background: '#FEF3C7', color: 'var(--orange)' }}>Zapier</span>
              </div>
            </div>

            <div className={styles.levelRow}>
              <div className={styles.levelLabel} style={{ background: 'var(--green)' }}>
                ADVANCED
                <span className={styles.levelLabelSub}>AI is already working &mdash; ready to compound</span>
              </div>
              <div className={styles.levelBody}>
                <div className={styles.levelNext}>&#8594; Build AI that surfaces problems before you see them.</div>
                <div className={styles.levelEg}>Custom tools &middot; Automated reporting &middot; Workflows that run without you</div>
              </div>
              <div className={styles.levelTools}>
                <span className={styles.toolChip} style={{ background: 'var(--green)', color: '#FFFFFF' }}>Claude Projects</span>
                <span className={styles.toolChip} style={{ background: '#DCFCE7', color: 'var(--green)' }}>Claude Code</span>
                <span className={styles.toolChip} style={{ background: '#DCFCE7', color: 'var(--green)' }}>Supabase</span>
              </div>
            </div>
          </div>

          <div className={styles.levelNote}>
            <div className={styles.levelNoteText}>Same method at every level. The R in DEEPER &mdash; Refine &mdash; is what makes the ceiling keep rising.</div>
          </div>
        </section>

        {/* ── 09 TOOLS ───────────────────────────────────── */}
        <section id="tools" className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>08</div>
            <div>
              <div className={styles.sectionEyebrow}>Your Build Stack</div>
              <h2>Key tools &mdash;<br />links and first steps.</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <p className={styles.sectionIntro}>
              You don&apos;t need all of these. Every path starts with Claude.
            </p>
          </div>

          <div className={styles.toolGrid}>
            {[
              { name: 'Claude', badge: '$20/mo', badgeBg: '#DBEAFE', badgeColor: 'var(--teal)', desc: 'Your AI thinking partner. Use Projects to build persistent AI that remembers your business. Start here.', link: 'claude.ai', href: 'https://claude.ai' },
              { name: 'Claude Code', badge: 'Included', badgeBg: '#DBEAFE', badgeColor: 'var(--teal)', desc: "Describe what you want built — it writes, tests and iterates the code. No coding knowledge required.", link: 'claude.ai/code', href: 'https://claude.ai/code' },
              { name: 'GitHub', badge: 'Free', badgeBg: '#F3F4F6', badgeColor: 'var(--text-muted)', desc: 'Stores and versions everything you build. Required for deploying with Vercel.', link: 'github.com', href: 'https://github.com' },
              { name: 'Supabase', badge: 'Free tier', badgeBg: '#DCFCE7', badgeColor: 'var(--green)', desc: 'A real database for custom tools. If your solution needs to store data persistently, Supabase handles the backend.', link: 'supabase.com', href: 'https://supabase.com' },
              { name: 'Vercel', badge: 'Free tier', badgeBg: '#DCFCE7', badgeColor: 'var(--green)', desc: 'Deploys your web tools to a live URL in minutes. Connect GitHub, push code, it publishes automatically.', link: 'vercel.com', href: 'https://vercel.com' },
              { name: 'Zapier', badge: 'Free tier', badgeBg: '#FEF3C7', badgeColor: 'var(--gold)', desc: 'When something happens in one app, Zapier triggers an action in another. 5 Zaps free to start.', link: 'zapier.com', href: 'https://zapier.com' },
              { name: 'Make', badge: 'Free tier', badgeBg: '#FEF3C7', badgeColor: 'var(--gold)', desc: 'More powerful than Zapier for complex multi-step automations. Visual workflow builder. 1,000 ops/month free.', link: 'make.com', href: 'https://make.com' },
              { name: 'Manus', badge: 'Agent', badgeBg: '#F3E8FF', badgeColor: '#7C3AED', desc: 'Give it a goal and it browses, codes and delivers a finished result. Zero setup.', link: 'manus.im', href: 'https://manus.im' },
            ].map((tool, i) => (
              <a key={i} href={tool.href} target="_blank" rel="noopener noreferrer" className={styles.toolCard}>
                <div className={styles.toolName}>
                  {tool.name}
                  <span className={styles.toolBadge} style={{ background: tool.badgeBg, color: tool.badgeColor }}>{tool.badge}</span>
                </div>
                <div className={styles.toolDesc}>{tool.desc}</div>
                <div className={styles.toolLink}>{tool.link} &#8599;</div>
              </a>
            ))}
          </div>
        </section>
      </main>

      {/* CTA SECTION */}
      <div className={styles.ctaSection}>
        <div className={styles.ctaInner}>
          <h2>Ready to find your version of Sarah&apos;s problem?</h2>
          <p>Start with the Phase 1 Master Prompt. Paste it in. Answer honestly. Everything flows from there.</p>
          <div className={styles.ctaBtns}>
            <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className={styles.ctaButton}>
              Open Claude and start &#8599;
            </a>
            <a href="/ai-advantage/AI_Advantage_Slides.pdf" download className={styles.ctaButtonAlt}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download the slides
            </a>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className={styles.footer}>
        <a href="https://www.wisdombi.ai">
          <Image
            src="/images/logo-tight.png"
            alt="WisdomBi — Business Intelligence"
            width={180}
            height={90}
            className={styles.footerLogo}
          />
        </a>
        <p>Wisdom Consulting Group &middot; wisdombi.ai</p>
        <p className={styles.footerContact}>
          The AI Advantage &middot; Session Reference &middot;{' '}
          <a href="mailto:matt@wisdombi.au">matt@wisdombi.au</a>
        </p>
      </footer>

      {/* BACK TO TOP */}
      <button
        className={`${styles.backToTop} ${showBackToTop ? styles.backToTopVisible : ''}`}
        onClick={scrollToTop}
        aria-label="Back to top"
      >
        &#8593;
      </button>
    </div>
  )
}
