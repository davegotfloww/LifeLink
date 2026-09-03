from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm

TITLE = "LifeLink: Detailed Code Function Guide"
AUTHOR = "Prince David Dosunmu"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleStyle', parent=styles['Title'], fontSize=22, leading=26, textColor=colors.HexColor('#7a1d2a'), spaceAfter=12))
styles.add(ParagraphStyle(name='SectionStyle', parent=styles['Heading2'], fontSize=15, leading=18, textColor=colors.HexColor('#7a1d2a'), spaceBefore=18, spaceAfter=8))
styles.add(ParagraphStyle(name='BodyStyle', parent=styles['BodyText'], fontSize=10, leading=14, spaceAfter=6))
styles.add(ParagraphStyle(name='ListStyle', parent=styles['BodyText'], fontSize=10, leading=14, leftIndent=18, bulletIndent=8, spaceAfter=5))
styles.add(ParagraphStyle(name='MetaStyle', parent=styles['BodyText'], fontSize=9, leading=12, textColor=colors.HexColor('#444444'), spaceAfter=12))
styles.add(ParagraphStyle(name='NoteStyle', parent=styles['BodyText'], fontSize=9, leading=13, backColor=colors.HexColor('#f7ece9'), borderColor=colors.HexColor('#a8192a'), borderWidth=1, borderPadding=8, spaceAfter=12, leftIndent=12))

sections = []

sections.append(Paragraph(TITLE, styles['TitleStyle']))
sections.append(Paragraph(f"Personal technical reference for: {AUTHOR}", styles['MetaStyle']))
sections.append(Paragraph("Files reviewed: script.js, server.js, README.md, data.json", styles['MetaStyle']))
sections.append(Spacer(1, 8*mm))

sections.append(Paragraph("1. Project overview", styles['SectionStyle']))
sections.append(Paragraph(
    "LifeLink is a blood-donation web project designed to connect hospitals and donors. The front-end uses HTML, CSS, and JavaScript, while the backend is a Node.js + Express server that stores data in a JSON file. The app aims to help hospitals create urgent blood requests and allow donors to register and respond to those needs.",
    styles['BodyStyle']
))

sections.append(Paragraph("The main goal of the app is simple: make urgent blood donation processes easier, more visible, and more organized for both hospitals and donors.", styles['BodyStyle']))

sections.append(Paragraph("2. Frontend structure and lifecycle", styles['SectionStyle']))
sections.append(Paragraph(
    "The front-end behavior is mainly controlled by script.js. It uses an IIFE (Immediately Invoked Function Expression) to keep variables and functions isolated from the global scope and prevent naming collisions. On DOMContentLoaded, the script runs key startup functions in a sequence that sets up navigation, animations, observers, auth logic, and the mobile hero menu.",
    styles['BodyStyle']
))

sections.append(Paragraph("3. Detailed explanation of the functions in script.js", styles['SectionStyle']))

funcs = [
    ("injectStyles()", "Creates a style tag in the document head and injects CSS required for scroll offset, active nav highlight, mobile menu visibility, and scroll reveal animations. This keeps behavior-specific styling out of the main HTML file and makes the interactive UI easier to maintain."),
    ("initNav()", "Opens and closes the mobile navigation menu. It adds ARIA attributes, toggles the .open class, closes the menu when an item is selected or when the user clicks outside, detects the Escape key, and adds a header shadow after scrolling. This makes the navigation responsive and accessible."),
    ("initActiveLinkTracking()", "Uses IntersectionObserver to detect which section is visible and highlights its corresponding navigation link. This creates a smoother, more modern page experience where the nav updates as the viewer scrolls."),
    ("initReveal()", "Applies the reveal animation to content blocks such as section headers, steps, pairs, counters, urgent-items, and stats. It adds staggered delays and respects reduced-motion settings for accessibility."),
    ("animateNum(el)", "Animates numeric values from zero to their target value using requestAnimationFrame. It detects commas, decimals, and formatting, then updates the text smoothly so counters feel lively without losing readability."),
    ("initStatCounters()", "Finds the .stats section and runs the animations only when that section becomes visible, reducing wasted work and improving perceived performance."),
    ("initUrgentTimestamps()", "Parses text like 'requested 2 hours ago' and updates it every minute to create a live, urgent feel for emergency donation requests. It handles singular and plural time strings."),
    ("initFooterYear()", "Automatically replaces the year in the footer with the current year from the system clock so the page stays accurate without manual edits."),
    ("getStoredUsers()", "Reads the lifelinkUsers value from localStorage and converts it from JSON. If the value is invalid or missing, it returns an empty array instead of crashing."),
    ("saveStoredUsers(users)", "Persists the users array back into localStorage after a signup or update. This creates a lightweight demo persistence system without a database."),
    ("getStoredSession()", "Loads the current saved user object from localStorage. This acts like a lightweight session check for the browser."),
    ("setStoredSession(user)", "Stores the logged-in user as the active session so the app remembers who the user is during navigation."),
    ("clearStoredSession()", "Removes the current session when the user logs out so the page returns to the unauthenticated state."),
    ("isAuthPage()", "Checks if the current page is auth.html and is used to redirect an already logged-in user away from the login page."),
    ("renderUserIsland()", "Creates a small user profile island in the header, showing the user role and initials. It also hides the auth link and changes the CTA button to 'Open dashboard' for logged-in users. This keeps the UI personalized and role-aware."),
    ("initAuth()", "This is the main authenticator initializer. It redirects already logged-in users to the dashboard, sets up login and signup tabs, validates fields, saves the new user, logs in matching credentials, and updates session state. It is the central logic for the app's local account flow."),
    ("showTab(target)", "Switches between the login and signup tabs and hides/shows their respective panels. It also updates accessibility states through aria-selected and visibility toggles."),
    ("updateRoleFields()", "Shows or hides donor-specific and hospital-specific fields depending on the selected role. It also marks the relevant inputs as required when needed."),
    ("renderSession()", "Displays the session information inside the auth page such as the user's name, role, and details. It also reveals the hospital dashboard button when the active user is a hospital account."),
    ("initHeroAccess()", "Builds the quick access mobile menu by cloning navigation links into a floating menu. It supports positioning, opening/closing transitions, click-away detection, and Escape key handling, making the mobile experience more usable."),
]

for name, desc in funcs:
    sections.append(Paragraph(f"- {name}", styles['ListStyle']))
    sections.append(Paragraph(desc, styles['BodyStyle']))

sections.append(Paragraph("4. Backend logic in server.js", styles['SectionStyle']))
sections.append(Paragraph("The server is a lightweight Express API that handles user signup, login, request creation, request updates, and admin actions.", styles['BodyStyle']))

backend_funcs = [
    ("readData()", "Loads the JSON file and parses it into a JavaScript object. If the file is missing or invalid, it falls back to { users: [], requests: [] } so the server still runs without crashing."),
    ("writeData(data)", "Writes the data back to data.json in a readable pretty-printed format."),
    ("hashPassword(password, salt = null)", "Generates a secure password hash using crypto.scryptSync and returns both the random salt and the hash."),
    ("GET /api/ping", "Health-check endpoint that confirms the backend is running and responding."),
    ("POST /api/signup", "Validates signup details, checks for duplicate emails, hashes the password, creates a user record, and stores it in data.json."),
    ("POST /api/login", "Validates credentials by comparing the submitted password to the stored hash using the same salt. If matched, it returns the user object without exposing password data."),
    ("GET /api/requests", "Fetches requests with optional filters for status, type, location, and hospitalId."),
    ("POST /api/requests", "Creates a request record for a hospital, including type, place, priority, request time, hospital data, contact, and timestamps."),
    ("PUT /api/requests/:id", "Updates an existing request while allowing partial edits and validating acceptable statuses such as open, fulfilled, and cancelled."),
    ("GET /api/admin/users", "Returns user records only when the correct admin key is provided. It sanitizes the output to avoid sending passwords."),
    ("POST /api/admin/verify-user", "Lets an admin verify or unverify a user account by updating the verified flag."),
    ("Not found fallback route", "Returns a 404 response if a user requests an invalid route."),
]

for name, desc in backend_funcs:
    sections.append(Paragraph(f"- {name}", styles['ListStyle']))
    sections.append(Paragraph(desc, styles['BodyStyle']))

sections.append(Paragraph("5. How the project works together", styles['SectionStyle']))
sections.append(Paragraph(
    "The user first lands on the website. The browser loads the HTML and JavaScript, which run the interactive functions. The front-end stores session state in localStorage, giving the user a persistent sign-in state without a real database. When the project uses the Node backend, the API reads and writes to data.json for authentication and medical requests. Together, the interface layer, logic layer, and data layer create a working demo application.",
    styles['BodyStyle']
))

sections.append(Paragraph("6. Important developer notes", styles['SectionStyle']))
sections.append(Paragraph("- The project is a strong demo prototype, not a production medical platform.", styles['ListStyle']))
sections.append(Paragraph("- localStorage is used to mimic login persistence but is not secure enough for real-world healthcare systems.", styles['ListStyle']))
sections.append(Paragraph("- data.json acts as a simple file database and is easy to work with for educational and prototype use.", styles['ListStyle']))
sections.append(Paragraph("- Real production systems would need a proper relational or NoSQL database, stronger authorization, secure sessions, and more robust validation.", styles['ListStyle']))
sections.append(Paragraph("This guide was created specifically for Prince David Dosunmu as a personal, detailed explanation of how the project functions work and how they connect together.", styles['NoteStyle']))
sections.append(Spacer(1, 6*mm))
sections.append(Paragraph("End of personal code reference", styles['MetaStyle']))

pdf_path = r"c:\Users\Prince David\Desktop\LifeLink.web\Prince_David_LifeLink_Code_Function_Guide.pdf"
doc = SimpleDocTemplate(pdf_path, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm)
doc.build(sections)
print(f"PDF created: {pdf_path}")
