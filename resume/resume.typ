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
  Mobile Software Engineer with over six years of experience working with a
  team to improve, maintain, and implement features for Android and iOS
  applications with over millions of downloads.
]

// ── Experience ──────────────────────────────────────────────────────────────
#section[Professional Experience]

#job(
  [July 2022–Present],
  [Square],
  [Mobile Software Engineer],
  (
    [Leader for multiple large scale projects for Square's Android and iOS
      Checkout across both mobile and custom hardware devices.],
    [Lead, implemented, and maintained Offline Payments and Checkout for the
      Android and iOS Point of Sale applications.],
    [Expanded Offline Payments to over 4 million users doubling GPV for
      offline payment sales across Android and iOS.],
    [Collaborate between product managers, quality engineers, UI designers,
      and other software engineers to both bring projects to success and
      monitor their health long-term.],
    [Ensure application and payment health through extensive test plans, UI
      testing, and metrics monitoring to both prevent and swiftly recover
      failures.],
  ),
)

#job(
  [June 2020–July 2022],
  [Alarm.com],
  [Android Software Engineer II],
  (
    [Primary code writer for large scale Android projects including a complete
      UI/UX refresh and implementing Dark Mode across the app.],
    [Review code and provide useful feedback for teammates to improve the
      quality of the codebase and prevent bugs.],
    [Collaborate with product managers, quality engineers, UI designers, and
      other software engineers to implement features and improvements for the
      Android application and backend services.],
    [Write unit tests and UI tests utilizing Espresso, Roboelectric, and JUnit.],
    [Create build scripts and Gradle tasks for improving the build process.],
    [Mentored two interns and guided them in collaborating with the team to
      successfully produce an upcoming feature.],
  ),
)

#job(
  [June 2019–August 2019],
  [Alarm.com],
  [Android Software Engineer Intern],
  (
    [Reconstructed the notification system for the Android application and
      implemented bundled notifications.],
    [Responsible for numerous bugs fixes and minor enhancements.],
    [Collaborated with product managers and quality engineers for improving
      accessibility for the Android application.],
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
      [#text(weight: "bold")[Languages:] Kotlin, Java, JavaScript, C\#, Ruby,
        Groovy],
      [#text(weight: "bold")[Tools:] Android Studio, Git, Atlassian Suite,
        Espresso, Roboelectric, React.js, .NET],
    )
  ],
)
