'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import styles from './bali-retreat.module.css'

export default function BaliRetreatPage() {
  const [showBackToTop, setShowBackToTop] = useState(false)

  useEffect(() => {
    // ── PAGE FADE IN ─────────────────────────────────
    document.querySelector(`.${styles.page}`)?.classList.add(styles.pageVisible)

    // ── COPY BUTTONS ─────────────────────────────────
    const copyButtons = document.querySelectorAll(`.${styles.copyBtn}`)
    copyButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const pre = btn.closest(`.${styles.promptBlock}`)?.querySelector('pre')
        if (!pre) return
        navigator.clipboard.writeText(pre.textContent?.trim() || '').then(() => {
          btn.innerHTML = '&#10003; Copied'
          btn.classList.add(styles.copied)
          setTimeout(() => {
            btn.textContent = 'Copy'
            btn.classList.remove(styles.copied)
          }, 2000)
        })
      })
    })

    // ── SMOOTH SCROLL NAV LINKS (event delegation) ──
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
      {/* HEADER — unified navy block */}
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
          <span className={styles.headerBadge}>Cocktails with Claude &middot; Bali 2026</span>
        </div>
        <div className={styles.headerHero}>
          {/* Left illustration — martini glass */}
          <div className={`${styles.heroIllustration} ${styles.heroIllustrationLeft}`}>
            <svg width="230" height="280" viewBox="0 0 180 220" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Glass bowl */}
              <path d="M30 30L90 110L150 30" stroke="#F5821F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M30 30L90 110L150 30" fill="rgba(245,130,31,0.06)"/>
              {/* Liquid */}
              <path d="M42 45L90 110L138 45" fill="rgba(245,130,31,0.08)"/>
              <line x1="42" y1="45" x2="138" y2="45" stroke="#F5821F" strokeWidth="1.5" opacity="0.4"/>
              {/* Stem */}
              <line x1="90" y1="110" x2="90" y2="175" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"/>
              {/* Base */}
              <ellipse cx="90" cy="178" rx="30" ry="4" stroke="rgba(255,255,255,0.25)" strokeWidth="2" fill="none"/>
              {/* Olive on pick */}
              <line x1="125" y1="18" x2="138" y2="45" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="125" cy="18" r="6" fill="rgba(5,150,105,0.5)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>
              <circle cx="125" cy="18" r="2" fill="rgba(245,130,31,0.4)"/>
              {/* Bubbles */}
              <circle cx="75" cy="70" r="2.5" fill="rgba(255,255,255,0.12)"/>
              <circle cx="100" cy="85" r="2" fill="rgba(255,255,255,0.1)"/>
              <circle cx="85" cy="55" r="1.5" fill="rgba(255,255,255,0.08)"/>
              <circle cx="95" cy="65" r="3" fill="rgba(255,255,255,0.06)"/>
            </svg>
          </div>

          {/* Right illustration — champagne flute */}
          <div className={`${styles.heroIllustration} ${styles.heroIllustrationRight}`}>
            <svg width="180" height="280" viewBox="0 0 140 220" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Flute rim */}
              <ellipse cx="70" cy="22" rx="28" ry="6" stroke="#F5821F" strokeWidth="2" fill="none"/>
              {/* Glass body */}
              <path d="M42 22C42 22 44 100 70 120C96 100 98 22 98 22" stroke="#F5821F" strokeWidth="2" fill="rgba(245,130,31,0.05)"/>
              {/* Liquid level */}
              <path d="M46 40C46 40 48 90 70 108C92 90 94 40 94 40" fill="rgba(245,130,31,0.08)"/>
              <ellipse cx="70" cy="40" rx="24" ry="5" stroke="#F5821F" strokeWidth="1" opacity="0.3" fill="none"/>
              {/* Stem */}
              <line x1="70" y1="120" x2="70" y2="180" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round"/>
              {/* Base */}
              <ellipse cx="70" cy="183" rx="26" ry="4" stroke="rgba(255,255,255,0.25)" strokeWidth="2" fill="none"/>
              {/* Rising bubbles */}
              <circle cx="62" cy="95" r="2" fill="rgba(255,255,255,0.15)"/>
              <circle cx="75" cy="80" r="1.5" fill="rgba(255,255,255,0.12)"/>
              <circle cx="68" cy="65" r="2.5" fill="rgba(255,255,255,0.1)"/>
              <circle cx="78" cy="50" r="1.5" fill="rgba(255,255,255,0.08)"/>
              <circle cx="65" cy="45" r="2" fill="rgba(255,255,255,0.06)"/>
              <circle cx="72" cy="32" r="1.5" fill="rgba(255,255,255,0.05)"/>
              {/* Sparkle */}
              <circle cx="55" cy="28" r="1" fill="rgba(255,255,255,0.2)"/>
              <circle cx="85" cy="25" r="1" fill="rgba(255,255,255,0.15)"/>
            </svg>
          </div>

          <div className={styles.heroLabel}>Cocktails with Claude</div>
          <h1>
            Your build resources.
            <br />
            Everything in one place.
          </h1>
          <div className={styles.heroRule} />
          <p>
            The frameworks, prompts, tool guides and references from today&apos;s
            session. Bookmark this page — it&apos;s yours to keep.
          </p>
          <p className={styles.heroHint}>
            New to AI? Start with the Stage 1 prompt below — it works even if you&apos;ve never used Claude before.
          </p>
        </div>
        {/* Subtle dot pattern overlay */}
        <div className={styles.heroPattern} />
      </header>

      {/* NAV */}
      <nav className={styles.stickyNav}>
        <div className={styles.navInner}>
          <ul>
            <li><a href="#unpack" className={styles.navActive}>Unpack Your Problem</a></li>
            <li><a href="#possibilities">What&apos;s Possible</a></li>
            <li><a href="#tools">Tool Links</a></li>
            <li><a href="#agents">Agents</a></li>
          </ul>
        </div>
        <div className={styles.navFade} />
      </nav>

      {/* MAIN */}
      <main className={styles.main}>

        {/* ── SECTION 1: UNPACKING ─────────────────────── */}
        <section id="unpack" className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>01</div>
            <div>
              <div className={styles.sectionEyebrow}>Stage 1 — Surface</div>
              <h2>The 5-Layer Problem Unpacking Model</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <p className={styles.sectionIntro}>
              Most people describe the symptom and stop. The breakthrough always
              happens at Layer 3 — the constraint. Work through these layers before
              you open Claude, or use them to guide your conversation.
            </p>
          </div>

          <div className={styles.layers}>
            {/* Layer 1 */}
            <div className={styles.layer}>
              <div className={styles.layerNum}>1</div>
              <div className={styles.layerBody}>
                <div className={styles.layerName}>The Symptom — what you notice</div>
                <div className={styles.layerDesc}>
                  The thing that annoys you or shows up as a problem. It&apos;s real,
                  but it&apos;s not the problem — it&apos;s the signal that a problem
                  exists underneath.
                </div>
                <div className={styles.exampleBox}>
                  <div className={styles.exLabel}>Say this to Claude</div>
                  <div className={styles.exPrompt}>
                    &quot;The biggest problem I keep running into is [describe it in one sentence].
                    It affects [who] and it happens [how often]. Don&apos;t solve it yet — just
                    ask me questions to understand it better.&quot;
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 2 */}
            <div className={styles.layer}>
              <div className={styles.layerNum}>2</div>
              <div className={styles.layerBody}>
                <div className={styles.layerName}>The Process — what&apos;s actually happening</div>
                <div className={styles.layerDesc}>
                  Map out the steps. Who does what, when, using which tools.
                  You&apos;re looking for where manual effort, handoffs, or gaps
                  exist. Write it as a sequence, not a description.
                </div>
                <div className={styles.exampleBox}>
                  <div className={styles.exLabel}>Say this to Claude</div>
                  <div className={styles.exPrompt}>
                    &quot;I&apos;m going to describe how [this process] currently works
                    in my business, step by step. After I&apos;m done, I want you to
                    map it back to me as a numbered sequence — and flag where you
                    see manual steps, handoffs, or gaps that could break.&quot;
                  </div>
                  <div className={styles.exDivider} />
                  <div className={styles.exLabel}>Then describe your process</div>
                  <div className={styles.costFrames}>
                    Tell Claude what actually happens — who does what, in what order,
                    using which tools. Be specific and messy. Claude will clean it up
                    and show you the gaps you can&apos;t see when you&apos;re inside it every day.
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 3 — THE ONE */}
            <div className={styles.layer}>
              <div className={`${styles.layerNum} ${styles.layerNumHighlight}`}>3</div>
              <div className={styles.layerBody}>
                <div className={`${styles.layerName} ${styles.layerNameHighlight}`}>
                  The Constraint — where it breaks &#11088; This is the one
                </div>
                <div className={styles.layerDesc}>
                  The specific point in the process where it fails, slows down,
                  or depends on one person. This is what you&apos;re actually
                  solving. If you can name this precisely, the solution designs itself.
                </div>
                <div className={styles.exampleBox}>
                  <div className={styles.exLabel}>Say this to Claude</div>
                  <div className={styles.exPrompt}>
                    &quot;I think the real bottleneck is [your best guess at where it breaks].
                    Push back on that — is that really the root constraint, or is there
                    something underneath it? Help me get to the real one and restate it
                    in one sentence I can act on.&quot;
                  </div>
                  <div className={styles.exDivider} />
                  <div className={styles.exLabel}>What good looks like</div>
                  <div className={styles.exBad}>&#10007; &quot;Our invoicing is slow&quot;</div>
                  <div className={styles.exArrow}>&#8595;</div>
                  <div className={styles.exGood}>
                    &#10003; &quot;Invoices only get sent when I personally approve
                    them — there&apos;s no trigger for the admin to send without
                    my sign-off, so they pile up when I&apos;m on site&quot;
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 4 */}
            <div className={styles.layer}>
              <div className={styles.layerNum}>4</div>
              <div className={styles.layerBody}>
                <div className={styles.layerName}>The Cost — what not solving it actually costs</div>
                <div className={styles.layerDesc}>
                  Be specific. Vague cost = low urgency = no action. Quantify in
                  time, money, or risk. If you can&apos;t put a number on it, the
                  problem probably isn&apos;t ready to solve yet.
                </div>
                <div className={styles.exampleBox}>
                  <div className={styles.exLabel}>Say this to Claude</div>
                  <div className={styles.exPrompt}>
                    &quot;I think this problem costs me roughly [your estimate] in
                    [time/money/risk] per [week/month]. Help me be more precise —
                    ask me about the specific costs I might be missing, then
                    summarise the total impact in 2-3 bullet points with hard numbers.&quot;
                  </div>
                  <div className={styles.exDivider} />
                  <div className={styles.exLabel}>Formats that land</div>
                  <div className={styles.costFrames}>
                    &#9201; &quot;This costs us <strong>X hours per week</strong>&quot;<br />
                    &#128176; &quot;This creates roughly <strong>$X in lost cash flow</strong> per month&quot;<br />
                    &#9888;&#65039; &quot;If we don&apos;t fix this, we risk <strong>[specific consequence]</strong>&quot;<br />
                    &#128275; &quot;Solving this unlocks <strong>[specific opportunity]</strong> we can&apos;t pursue now&quot;
                  </div>
                </div>
              </div>
            </div>

            {/* Layer 5 */}
            <div className={styles.layer}>
              <div className={styles.layerNum}>5</div>
              <div className={styles.layerBody}>
                <div className={styles.layerName}>The Owner — why it hasn&apos;t been solved</div>
                <div className={styles.layerDesc}>
                  Who owns this problem and why does it persist? Usually: no clear
                  owner, the owner is too busy, or the solution requires technical
                  skill nobody has. Understanding this shapes what solution will actually stick.
                </div>
                <div className={styles.exampleBox}>
                  <div className={styles.exLabel}>Say this to Claude</div>
                  <div className={styles.exPrompt}>
                    &quot;This problem has existed for [timeframe]. The person who
                    should own it is [name/role]. The reason it hasn&apos;t been solved
                    is [your honest assessment]. Given that, what does the solution
                    need to look like to actually get used — not just built?&quot;
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick-start shortcuts — all 4 stage prompts */}
          <div className={styles.shortcuts}>
            <div className={styles.shortcutsTitle}>Shortcuts — copy a prompt and go</div>
            <div className={styles.shortcutsDesc}>Don&apos;t want to work through the layers? Paste one of these directly into Claude.</div>
            <div className={styles.shortcutsGrid}>
              <div className={styles.shortcutCard}>
                <div className={styles.shortcutHeader}>
                  <span className={styles.shortcutNum}>1</span>
                  <span className={styles.shortcutLabel}>Surface the problem</span>
                </div>
                <div className={styles.promptBlock}>
                  <button className={styles.copyBtn}>Copy</button>
                  <pre>{`I want to describe a problem in my business. I'm not looking for solutions yet — I want you to help me understand the problem more clearly.

Ask me questions one at a time until you can restate my problem back to me in 2 sentences that I'd agree are exactly right.

Start with: what is the problem, and who experiences it most directly?`}</pre>
                </div>
              </div>
              <div className={styles.shortcutCard}>
                <div className={styles.shortcutHeader}>
                  <span className={styles.shortcutNum}>2</span>
                  <span className={styles.shortcutLabel}>Design the architecture</span>
                </div>
                <div className={styles.promptBlock}>
                  <button className={styles.copyBtn}>Copy</button>
                  <pre>{`Based on everything we've discussed, design a solution architecture for this problem.

Give me:
1. The core components — what are the distinct parts?
2. What to build first and why — sequence matters
3. What success looks like in 90 days — specific and measurable
4. The biggest risks I should know about — be honest

Then I want to stress-test it. After you give me the architecture, I'll ask: what are you assuming about my business that might not be true?`}</pre>
                </div>
              </div>
              <div className={styles.shortcutCard}>
                <div className={styles.shortcutHeader}>
                  <span className={styles.shortcutNum}>3</span>
                  <span className={styles.shortcutLabel}>Build it</span>
                </div>
                <div className={styles.promptBlock}>
                  <button className={styles.copyBtn}>Copy</button>
                  <pre>{`Take the first component we identified. Build it completely — give me the working version, not a description of what it would do.

If it's a document or process: write it fully, formatted and ready to use.
If it's a tool or app: write the complete code I can run or deploy.
If it's a Claude Project: write the full system prompt and instructions.
If it's a spec: write the complete technical brief a developer could build from.

Don't summarise. Build it.`}</pre>
                </div>
              </div>
              <div className={styles.shortcutCard}>
                <div className={styles.shortcutHeader}>
                  <span className={styles.shortcutNum}>4</span>
                  <span className={styles.shortcutLabel}>Capture the outcome</span>
                </div>
                <div className={styles.promptBlock}>
                  <button className={styles.copyBtn}>Copy</button>
                  <pre>{`Summarise what we built in this conversation in 3 sentences.

Then give me:
- The one thing I need to do in the next 7 days to move this forward
- The one dependency that could block me
- One question I should ask myself before I start`}</pre>
                </div>
              </div>
            </div>

            {/* Stress tests inside shortcuts */}
            <div className={styles.stressTests}>
              <div className={styles.stressTestsTitle}>
                Stress-test prompts — paste these into Claude to pressure-test any solution
              </div>
              <div className={styles.stressGrid}>
                {[
                  'Rate this solution out of 10. What would make it a 10?',
                  'What are you assuming about my business that might not be true?',
                  'If I could only build one component first — which one and why?',
                  'What would make this architecture fail?',
                  'What have I not asked you that I should have?',
                  'What\'s the simplest version of this that would still solve the problem?',
                ].map((q, i) => (
                  <div key={i} className={styles.stressCard}>&quot;{q}&quot;</div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION 2: POSSIBILITIES MAP ─────────────── */}
        <section id="possibilities" className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>02</div>
            <div>
              <div className={styles.sectionEyebrow}>Stage 2 — Design</div>
              <h2>What&apos;s Possible — The Build Map</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <p className={styles.sectionIntro}>
              Most people self-limit because they don&apos;t know what&apos;s
              achievable. This map shows what you can build and what it takes.
              Start with what you want, not with the tool.
            </p>
          </div>

          <div className={styles.possGrid}>
            {[
              { label: 'A document, process or system', sub: 'SOP, checklist, onboarding guide, policy', tools: [{ name: 'Claude', style: 'pillNavy' }], dots: 1, level: 'Easy — today', step: 'Describe the process to Claude and ask it to structure it', difficulty: 'easy' },
              { label: 'A persistent AI team member', sub: 'AI that knows your business and handles recurring tasks', tools: [{ name: 'Claude Projects', style: 'pillNavy' }], dots: 1, level: 'Easy — today', step: 'Create a Project, paste in your architecture as instructions', difficulty: 'easy' },
              { label: 'Automated workflows', sub: 'When X happens, do Y automatically', tools: [{ name: 'Zapier', style: 'pillOrange' }, { name: 'Make', style: 'pillOrange' }, { name: 'Claude Projects', style: 'pillNavy' }], dots: 2, level: 'Medium', step: 'Ask Claude to write a Zap specification, then build it', difficulty: 'medium' },
              { label: 'A working web tool', sub: 'Calculator, tracker, dashboard, internal app', tools: [{ name: 'Claude Code', style: 'pillTeal' }, { name: 'GitHub', style: 'pillNavy' }, { name: 'Vercel', style: 'pillGreen' }], dots: 2, level: 'Medium', step: 'Ask Claude to write a technical spec, then open Claude Code', difficulty: 'medium' },
              { label: 'A tool with a real database', sub: 'Stores data, user accounts, persistent records', tools: [{ name: 'Claude Code', style: 'pillTeal' }, { name: 'GitHub', style: 'pillNavy' }, { name: 'Supabase', style: 'pillGreen' }, { name: 'Vercel', style: 'pillGreen' }], dots: 3, level: 'Advanced', step: 'Set up Supabase project first, then build with Claude Code', difficulty: 'advanced' },
              { label: 'An AI agent that works while you sleep', sub: 'Autonomous, multi-step, runs on a schedule', tools: [{ name: 'Manus', style: 'pillRed' }, { name: 'OpenClaw', style: 'pillRed' }], dots: 3, level: 'Advanced', step: 'Start with Manus (no setup). OpenClaw for full control.', difficulty: 'advanced' },
            ].map((row, i) => (
              <div key={i} className={`${styles.possCard} ${styles[`diff${row.difficulty}`]}`}>
                <div className={styles.possCardHeader}>
                  <div className={styles.wantLabel}>{row.label}</div>
                  <div className={styles.wantSub}>{row.sub}</div>
                </div>
                <div className={styles.possCardBody}>
                  <div className={styles.possCardRow}>
                    <span className={styles.possCardLabel}>Tools</span>
                    <div className={styles.possCardPills}>
                      {row.tools.map((t, j) => (
                        <span key={j} className={`${styles.pill} ${styles[t.style]}`}>{t.name}</span>
                      ))}
                    </div>
                  </div>
                  <div className={styles.possCardRow}>
                    <span className={styles.possCardLabel}>Level</span>
                    <div className={styles.levelDots}>
                      {[0, 1, 2].map((d) => (
                        <div key={d} className={`${styles.dot} ${d < row.dots ? styles.dotOn : ''}`} />
                      ))}
                      <span className={styles.levelLabel}>{row.level}</span>
                    </div>
                  </div>
                  <div className={styles.possCardRow}>
                    <span className={styles.possCardLabel}>First step</span>
                    <span className={styles.possCardStep}>{row.step}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 3: TOOLS ──────────────────────────── */}
        <section id="tools" className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>03</div>
            <div>
              <div className={styles.sectionEyebrow}>Your Build Stack</div>
              <h2>Key Tools — Links and First Steps</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <p className={styles.sectionIntro}>
              You don&apos;t need all of these. You need the ones that fit your
              architecture. Start with the first step listed — most of these are
              free to begin.
            </p>
          </div>

          {/* Featured tool — Claude */}
          <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className={styles.toolFeatured}>
            <div className={styles.toolTop}>
              <div className={styles.toolName}>Claude</div>
              <span className={`${styles.toolBadge} ${styles.badgePaid}`}>$20/mo Pro</span>
            </div>
            <div className={styles.toolDesc}>
              Your AI thinking partner for everything in this session. Use Projects to build
              persistent AI team members that remember your business context. This is the
              starting point for every build path on this page.
            </div>
            <div className={styles.toolMeta}>
              <span>claude.ai — Start here</span>
              <span className={styles.toolLinkIcon}>&#8599;</span>
            </div>
          </a>

          <div className={styles.toolGrid}>
            {[
              { name: 'Claude Code', badge: 'Included in Pro', badgeStyle: 'badgePaid', desc: "Claude's coding agent. Describe what you want to build, and it writes, tests, and iterates on the code. No coding knowledge required.", meta: 'claude.ai/code', href: 'https://claude.ai/code' },
              { name: 'GitHub', badge: 'Free', badgeStyle: 'badgeFree', desc: 'Version control for everything you build. Stores your code, tracks changes, and means you can always go back.', meta: 'github.com — Create a free account', href: 'https://github.com' },
              { name: 'Supabase', badge: 'Free tier', badgeStyle: 'badgeFree', desc: 'A real database for your custom tools. If your solution needs to store data, Supabase handles the backend.', meta: 'supabase.com — Create a project', href: 'https://supabase.com' },
              { name: 'Vercel', badge: 'Free tier', badgeStyle: 'badgeFree', desc: 'Deploys your web tools to a live URL in minutes. Connect GitHub, push code, Vercel publishes automatically.', meta: 'vercel.com — Connect GitHub', href: 'https://vercel.com' },
              { name: 'Zapier', badge: 'Free tier', badgeStyle: 'badgeFree', desc: 'Connects your existing tools automatically. When something happens in one app, Zapier triggers an action in another.', meta: 'zapier.com — Free: 5 Zaps', href: 'https://zapier.com' },
              { name: 'Make', badge: 'Free tier', badgeStyle: 'badgeFree', desc: 'More powerful than Zapier for complex multi-step automations. Visual workflow builder with logic and branching.', meta: 'make.com — Free: 1,000 ops/month', href: 'https://make.com' },
            ].map((tool, i) => (
              <a key={i} href={tool.href} target="_blank" rel="noopener noreferrer" className={styles.toolCard}>
                <div className={styles.toolTop}>
                  <div className={styles.toolName}>{tool.name}</div>
                  <span className={`${styles.toolBadge} ${styles[tool.badgeStyle]}`}>{tool.badge}</span>
                </div>
                <div className={styles.toolDesc}>{tool.desc}</div>
                <div className={styles.toolMeta}>
                  <span>{tool.meta}</span>
                  <span className={styles.toolLinkIcon}>&#8599;</span>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* ── SECTION 5: AGENTS ─────────────────────────── */}
        <section id="agents" className={`${styles.section} ${styles.fadeTarget}`}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionNum}>04</div>
            <div>
              <div className={styles.sectionEyebrow}>What&apos;s Coming</div>
              <h2>Autonomous Agents — Manus &amp; OpenClaw</h2>
            </div>
          </div>
          <div className={styles.prose}>
            <p className={styles.sectionIntro}>
              These tools represent the next level — AI that works autonomously
              while you sleep. They&apos;re powerful, but have real caveats.
              Here&apos;s an honest read on both.
            </p>
          </div>

          <div className={styles.agentGrid}>
            {/* MANUS */}
            <div className={styles.agentCardCompact}>
              <div className={styles.agentCompactHead}>
                <h3>Manus</h3>
                <div className={styles.agentTags}>
                  <span className={`${styles.pill} ${styles.pillOrange}`}>Cloud</span>
                  <span className={`${styles.pill} ${styles.pillGreen}`}>Free tier</span>
                </div>
              </div>
              <p className={styles.agentCompactDesc}>
                Give it a goal — &quot;research my top 5 competitors&quot; — and it browses
                the web, writes code, and delivers a finished report. Zero setup. Think of it
                as a digital contractor you brief once.
              </p>
              <div className={styles.agentCompactPros}>
                <span>&#10003; Research &amp; reports</span>
                <span>&#10003; No installation</span>
                <span>&#10003; Free to try</span>
              </div>
              <div className={styles.agentCompactCons}>
                <span>&#10007; Variable quality</span>
                <span>&#10007; Credit-based pricing</span>
              </div>
              <div className={styles.agentCompactCta}>
                <a href="https://manus.im" target="_blank" rel="noopener noreferrer">
                  Try Manus &#8599;
                </a>
              </div>
            </div>

            {/* OPENCLAW */}
            <div className={styles.agentCardCompact}>
              <div className={styles.agentCompactHead}>
                <h3>OpenClaw</h3>
                <div className={styles.agentTags}>
                  <span className={`${styles.pill} ${styles.pillTeal}`}>Open source</span>
                  <span className={`${styles.pill} ${styles.pillRed}`}>Technical</span>
                </div>
              </div>
              <p className={styles.agentCompactDesc}>
                A self-hosted AI agent that lives in WhatsApp, Slack, or Discord. It manages
                your calendar, triages emails, and runs tasks autonomously. Always on, persistent
                memory, you control everything. Requires technical setup.
              </p>
              <div className={styles.agentCompactPros}>
                <span>&#10003; Persistent &amp; autonomous</span>
                <span>&#10003; Lives in your chat apps</span>
                <span>&#10003; Free (pay for API only)</span>
              </div>
              <div className={styles.agentCompactCons}>
                <span>&#10007; Needs command line skills</span>
                <span>&#10007; Security risk if misconfigured</span>
              </div>
              <div className={styles.agentCompactCta}>
                <a href="https://openclaw.ai" target="_blank" rel="noopener noreferrer">
                  Explore OpenClaw &#8599;
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* CTA SECTION */}
      <div className={styles.ctaSection}>
        <div className={styles.ctaInner}>
          <h2>Ready to build?</h2>
          <p>Open Claude, paste the Stage 1 prompt, and describe the problem you want to solve. Everything else flows from there.</p>
          <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className={styles.ctaButton}>
            Start your first build on Claude &#8599;
          </a>
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
        <p>Cocktails with Claude &middot; Bali 2026</p>
        <p className={styles.footerContact}>Questions? <a href="mailto:matt@wisdombi.au">matt@wisdombi.au</a></p>
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
