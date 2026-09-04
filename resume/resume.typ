// Izzy Bennett — resume source of truth.
// Compile with: typst compile resume/resume.typ public/resume.pdf
// (or `npm run resume` from the repo root).
//
// Requires the Carlito font family (metric-compatible Calibri replacement):
//   brew install --cask font-carlito
// Layout mirrors the original Word-exported resume (teal accents, left-barred
// section headers, two-column education/skills block, centered footer).

#let accent = rgb("#31849c")
#let rule-color = rgb("#5e7a87")

#set page(
  paper: "us-letter",
  margin: (x: 0.85in, top: 0.5in, bottom: 0.75in),
  footer: [
    #line(length: 100%, stroke: 2pt + rule-color)
    #v(2pt)
    #align(center)[
      #text(size: 9pt, fill: rgb("#595959"))[
        #link("mailto:me@izzybennett.com")[#underline[me\@izzybennett.com]] | #link("https://izzybennett.com")[#underline[izzybennett.com]] | #link("https://github.com/izzyisdizzy")[#underline[github.com/izzyisdizzy]]
      ]
    ]
  ],
)

#set text(font: "Carlito",size: 10.5pt, fill: rgb("#262626"))
#set par(leading: 0.5em)
#set list(indent: 1.5em, spacing: 0.45em)

// Teal spaced-caps section header with a left accent bar.
#let section(title) = {
  v(0.5em)
  stack(
    dir: ltr,
    spacing: 6pt,
    line(angle: 90deg, length: 11pt, stroke: 2.5pt + accent),
    text(fill: accent, weight: "bold", size: 11pt, tracking: 1.5pt, upper(title)),
  )
  v(0.5em)
}

// One job entry: italic date line, bold company, plain title, bullets.
#let job(dates, company, title, bullets) = {
  text(style: "italic")[#dates]
  v(0.25em)
  [#text(weight: "bold")[#company] \ #title]
  v(0.1em)
  list(..bullets)
  v(0.35em)
}

// ── Name ────────────────────────────────────────────────────────────────────
#align(center)[
  #text(size: 19pt, weight: "bold", fill: accent)[Izzy Bennett]
]
#v(2pt)
#line(length: 100%, stroke: 2pt + rule-color)
#v(0.8em)

// ── Blurb ───────────────────────────────────────────────────────────────────
#text(style: "italic")[
  Mobile software engineer with 6+ years shipping Android and iOS apps used by
  millions. Technical lead for payments-critical systems at Square, scaling
  Offline Payments to 4M+ sellers and \~\$442M/yr in offline volume across
  mobile and custom hardware.
]

// ── Experience ──────────────────────────────────────────────────────────────
#section[Professional Experience]

#job(
  [July 2022–Present],
  [Square],
  [Mobile Software Engineer],
  (
    [Technical lead for Offline Payments and Checkout on Square Point of Sale
      for Android and iOS across mobile and custom hardware, owning design,
      implementation, rollout, and long-term health of a \~\$442M/yr payment
      flow.],
    [Expanded Offline Payments to over 4 million sellers, raising enablement
      from \~40% to 92.6% of users and doubling its share of Square GPV
      (0.11% to 0.22%, \~\$34M in added offline volume).],
    [Drive projects across product, design, quality engineering, and partner
      teams, defining rollout strategy, launch criteria, and success metrics
      for payment-critical features.],
    [Safeguard payment reliability through staged rollouts, extensive test
      plans and UI testing, and metrics monitoring and alerting to prevent
      and swiftly recover from failures.],
    [Mentor and onboard engineers onto new projects and features to set them
      up for success.],
  ),
)

#job(
  [June 2020–July 2022],
  [Alarm.com],
  [Android Software Engineer II],
  (
    [Led development of large-scale Android projects, including a complete
      UI/UX refresh and app-wide Dark Mode for an app used by millions.],
    [Shipped features spanning the Android app and its backend services in
      close collaboration with product, design, and quality engineering.],
    [Wrote unit and UI tests with JUnit, Robolectric, and Espresso; built
      Gradle tasks and build scripts to streamline the build process.],
    [Mentored two interns and guided them to successfully ship a production
      feature.],
  ),
)

#job(
  [June 2019–August 2019],
  [Alarm.com],
  [Android Software Engineer Intern],
  (
    [Reconstructed the Android notification system and implemented bundled
      notifications.],
    [Improved accessibility across the Android application in collaboration
      with product managers and quality engineers.],
  ),
)

// ── Education | Additional Skills ───────────────────────────────────────────
#grid(
  columns: (1fr, 1fr),
  column-gutter: 2em,
  [
    #section[Education]
    #text(style: "italic")[August 2017–May 2020]
    #v(0.4em)
    #text(weight: "bold")[George Mason University, Fairfax, VA] \
    Bachelor of Science in Computer Science \
    GPA: 3.86
  ],
  [
    #section[Additional Skills]
    #list(
      [#text(weight: "bold")[Languages:] Kotlin, Swift, TypeScript, C\#, Ruby],
      [#text(weight: "bold")[Mobile:] Jetpack Compose, SwiftUI, Gradle, JUnit,
        Robolectric, Espresso],
      [#text(weight: "bold")[Tools:] Git, Claude Code, Codex],
    )
  ],
)
