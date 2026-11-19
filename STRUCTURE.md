# Attendify application structure

## Vanilla CSS architecture

Role screens use `src/<role>/components/Name.jsx` and `src/<role>/styles/Name.module.css`, where role is organizer, student, or authentication. Each screen imports its stylesheet as `styles` and references the scoped classes through that object. CSS Modules remain vanilla CSS and require no added dependency in this Vite project.

StudentLayout and OrganizerLayout live in their role components folders and delegate to `layout/components/AppShell.jsx` with `layout/styles/AppShell.module.css`. Shared Navbar and Sidebar each separate `components/` and `styles/` with CSS Modules. Other shared components retain colocated ordinary CSS.

`main.jsx` loads `styles/variables.css`, `styles/reset.css`, and `styles/globals.css` once, in that order. The old `index.css` has been retired. There is no Tailwind dependency.

- Variables: centralized semantic colors, typography, spacing, radii, shadows, motion, z-index, and layout dimensions. Muted gray is a palette token; readable secondary text uses the darker secondary token.
- Reset: browser normalization without removing focus indicators.
- Globals: app base typography/background, keyboard focus, skip link, reduced-motion behavior, and fallback route presentation.
- Layout CSS: role-specific shells and content gutters.
- Component CSS: reusable appearance, internal spacing, and states.
- Page CSS: page-owned arrangement. Placeholder pages have minimal root styles ready for feature development.

Use BEM-style lowercase classes such as `sidebar__link--active` and `student-dashboard`. Role screen module classes are locally scoped; hyphenated names use bracket access such as `styles['student-dashboard']`. Shared ordinary CSS imports remain global and require unique names. Avoid global element selectors in modules and do not override component internals from screens. Add variants to the component instead. The reduced-motion accessibility rule is the intentional global `!important` exception.

The palette is light-only. Primary green buttons use dark text; information notices use a dark foreground on a light status surface. Breakpoint conventions are 640, 768, 1024, and 1280px, used only where content requires them. CSS media queries use literal values rather than custom properties.

The mobile header has an accessible Menu toggle with aria-expanded and aria-controls. Navigation expands in normal flow, closes on link selection or route changes, and Escape closes it and restores toggle focus. Link selection focuses the main content. At 1024px navigation becomes a persistent sidebar. Hidden mobile navigation is removed from keyboard navigation by display:none. The shell uses 16px, 24px, and 32px token-based content padding, with a bounded inner content width. Active sections include nested event and ticket routes; Create Event is distinguished from My Events.

QR printing, attendance table overflow, and report printing belong to their feature implementations; these screens still contain placeholders.

- `src/authentication/components` and `styles`: student login, organizer login, registration.
- `src/pages/student/components` and `styles`: discovery, event details/registration, tickets, bookings, dashboard, profile.
- `src/pages/organizer/components` and `styles`: event CRUD screens, scanner, attendance monitoring, reports/export.
- `src/components`: shared navigation, demo access screen, starter page presentation.
- `src/layout`: role-specific page shells with nested route outlets.
- `src/routes`: frontend session/role routing.
- `src/context`: auth context and provider; `src/hooks/useAuth.js` consumes it.
- `src/services`: future backend auth, events, registration, attendance, and Supabase access.
- `src/hooks`: future event fetching and attendance subscriptions.
- `src/utils`: future report export helper.
- `src/data`: reserved for mock data.

## Current status

The app is a frontend scaffold with mock Login/Register forms. AuthLayout and AuthForm live in authentication/components with separate CSS Modules in authentication/styles. Login and OrganizerLogin configure the shared form; Register configures account creation. Native required/email validation is combined with context validation and visible errors. Registration automatically signs in; duplicate emails and mismatched passwords are rejected. Organizer role selection is only a frontend testing option.

AuthProvider holds accounts in a React ref and the signed-in user in state. Passwords are excluded from the exposed user object. Nothing is sent to an API or saved in browser storage. Logout clears the session but keeps new demo accounts until refresh. Refresh clears both the session and newly registered accounts. Demo seeds are in src/data/mockUsers.js. Feature pages remain placeholders.

`ProtectedRoute` redirects signed-out visitors and prevents navigation into the other role's pages. This is a UI guard only. Real authentication, database permissions, organizer ownership checks, ticket issuance/validation, duplicate attendance protection, realtime subscriptions, and export still need implementation.

Keep registration in EventDetails unless it grows into its own screen. Reports can contain the export action. MyEvents lists events, CreateEditEvent handles the form, and EventManagement handles a selected event.

## Commands

```sh
npm install
npm run dev
npm run build
npm run lint
```

On PowerShell systems that block npm.ps1, use `npm.cmd` instead of `npm`.

## Testing mock authentication

- Student: student@attendify.test / Student123! ? /dashboard.
- Organizer: organizer@attendify.test / Organizer123! ? /organizer.
- Try a wrong password or use an organizer account on the student login: show an error without signing in.
- Register a unique email with matching passwords (8+ characters), choose a demo role, and verify its dashboard.
- Log out, then sign in with that new account on the matching role login.
- Check duplicate registration, blank fields, invalid email, and mismatched passwords.
- Open a protected event route while signed out; successful login should return to that role?s destination.
- Refresh: session and newly created accounts reset.

This is a synchronous local simulation; there is no fake network delay or API loading state. Use dummy passwords only. Replace the mock context with verified backend sessions before real use.

## Mock dashboards

StudentDashboard derives stats, upcoming bookings, and recent registrations from mockEvents and mockRegistrations, filtered by signed-in student ID. OrganizerDashboard filters event ownership, derives aggregate analytics and recent attendance, and stores simulated scan updates in component state. New accounts start empty.

The reference clock is fixed at September 20, 2026, 10:00 AM Asia/Manila. Live events are published events currently in progress at that reference time. Upcoming events start after that time. Attendance rate includes all registrations across the organizer?s events, including future events.

Expected demo student: 3 registrations, 1 upcoming, 1 attended. Expected organizer: 4 events, 5 registrations, 2 attended, 40% attendance. Simulate next scan twice on Campus Welcome Fair to exhaust its pending registrations. Counts and recent attendance update; Reset scans restores fixtures. Scan state resets on dashboard unmount and is not shared with other screens. Links still point to feature placeholders. No webcam or backend is involved.

## Event discovery and shared student bookings

BrowseEvents supports case-insensitive title search combined with category filtering. Only published events not ended at mockNow are shown. Click a card to open the native dialog (Escape/Close dismisses and restores focus). Register Event checks student role, availability, duplicates, and capacity. A successful registration updates the card, Student Dashboard, and My Bookings through EventsProvider; links in the dialog take you to either destination. Ticket pages remain placeholders.

Mock events include category, date, time, location, description, slots (total capacity), and isRegistered. The provider derives isRegistered per signed-in user and slotsRemaining across all registrations. Bookings persist across navigation/logout in memory and reset on refresh. Organizer scan simulation remains independent dashboard state.

Verification flow: sign in as the demo student; search Career and select Careers; open Campus Career Day and register. Expect dashboard registrations to increase from 3 to 4 and upcoming events from 1 to 2, with the new item in My Bookings. Reopening the card shows Registered and cannot submit again. Photo Walk demonstrates Full. A nonsense search shows the empty state; Clear filters restores results. Newly registered students only see their own bookings.

## Digital QR ticket

DigitalTicket.jsx and DigitalTicket.module.css provide the student ticket view; QRTicket is the existing route wrapper. Registration success, My Bookings, and dashboard ticket links use /ticket/:regId. The view resolves only the signed-in student?s booking.

qrcode.react renders a black-on-white SVG with a four-module quiet zone. The JSON payload contains studentId, eventId, and ticketId. ticketId is TKT- plus the full uppercase registration ID, preserving a stable reference without truncation. The visible reference and encoded ID match. Checked-in state comes from attendedAt; organizer dashboard simulated scans remain separate.

Download Ticket creates a full PNG with event details, student information, reference, status, and QR. Downloads are offline snapshots, not persistent application records; a refresh still resets newly created mock bookings. Native browser/camera scan and download verification remain manual checks.

## Organizer event management

CreateEventForm uses required inputs and context validation. EventsProvider holds the shared eventsList, checks organizer ownership, creates UUID IDs, and exposes saveEvent/deleteEvent. New events publish immediately and last two hours from the Manila start time. Editing preserves existing draft/published status. Capacity must be a positive integer and cannot drop below existing registration count. My Events lists only owned events and confirms deletion; events with bookings cannot be deleted, preserving tickets. Changes survive role switching via logout/login but reset on refresh. Organizer analytics now derive from shared event/registration data while scan simulation remains local.

Try creating an event after September 20, 2026, editing its title, then logging out and into the student account without refreshing. It should appear in Browse Events. An event ending before the mock clock is excluded from discovery. Delete an unregistered event in My Events to remove it across views.

## Webcam attendance scanner

Open My Events ? event ? Open QR Scanner. Choose an owned published event and click Start Camera to request access. html5-qrcode is loaded on demand. Camera access requires localhost or HTTPS; Stop Camera, event switching, and unmount clean up the stream. Feedback resets after 2.5 seconds.

checkIn validates JSON identifiers, selected event, organizer ownership, registration reference, and duplicate attendance before updating registrations synchronously. attendanceList is derived from attended registrations as the single source of truth. Ticket badges, student stats, and attendance screens read that shared state. Timestamps use current device time; no event-time restriction is enforced in this demo.

Manual test: save the demo student welcome-fair ticket, log out/in as organizer in the same tab without refreshing, open welcome-fair scanner, and scan the saved image from another screen. Try scanning twice, selecting a different event, denying permission, stopping/restarting, switching events, and leaving the route while permission is pending. Separate tabs/devices do not share in-memory registration data. Refresh resets new bookings/check-ins.

## Attendance monitoring and CSV reports

AttendanceMonitor.jsx with AttendanceMonitor.module.css is shared by attendance and reports routes. The event dropdown contains only the signed-in organizer?s events. Whole-event counters derive from registrations and attendanceList; search (name/ID) and status filters affect table rows and export only. Scanner writes are reflected through React Context without polling. This is same-session state, not cross-tab or network realtime.

exportAttendance.js builds quoted UTF-8 CSV with BOM, CRLF records, escaped quotes, formula-prefixed text protection, and explicit UTC+08:00 timestamps with seconds. The download contains exactly the filtered table?s columns and rows; no-match exports are disabled. Status filters allow exporting just checked-in students.

Manual verification: My Events ? event ? Attendance Records or Export Attendance Report; check counts, search name/ID, switch status/event, export and open CSV. Scan an unscanned ticket then return to see its status/timestamp/count updated. Browser download and physical webcam flows require manual verification.
