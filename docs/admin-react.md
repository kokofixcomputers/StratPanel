# The admin area as part of the React app

The admin area used to be Blade pages (AdminLTE, jQuery) next to the React app. It is moved into the app one page at a time: the pages that
are moved are drawn by the same React app as the rest of the panel, with the same components (cards, buttons, dialogs, inputs), the same
sidebar style as the account pages and the same theme. Pages that are not moved yet keep working as they were, nothing is lost on the way.

## Moved so far

Overview, Roles (the list, one role, who has it) and Locations. The rest (Settings, Users, Servers, Nodes, Nests and eggs, Mounts, Databases,
Application API, Updates, Extensions) is still Blade.

## How a moved page works

- **The page:** the `GET` route in `routes/admin.php` answers with `Admin\SpaController` (the same page as every other part of the panel). The
  permission middleware (`admin.can:...`) stays on the route, so the page is still refused for who may not open it.
- **The data:** `routes/api-admin.php`, mounted at `/api/client/admin` (the session of the person, like the rest of the client API). Every route
  names its permission with `admin.can`, the same one as the page. The controllers are in `app/Http/Controllers/Api/Client/Admin` and use the
  same services as the Blade controllers did, so the rules (who may give which role, ...) are the same code.
- **The app:** `routers/AdminRouter.tsx` (sidebar, small screen tabs, the routes), `routers/adminRoutes.ts` (the moved pages and the
  permission each needs), `lib/adminNav.ts` (what the sidebar lists), `components/admin/pages/*` (the pages), `api/admin/*` (the calls).
  What the signed in person may do (`admin_permissions`, every permission for root admins) comes with the page, see `User::toVueObject`.
- **Links:** use `AdminLink` for a link to a page of the admin area. It is a link inside the app for a moved page and a normal link for one
  that is not moved yet, so a page can be moved without changing the links that point at it.

## Moving the next page

1. An API controller in `Api/Client/Admin` and its routes in `routes/api-admin.php`, each with its `admin.can`.
2. The React page in `components/admin/pages`, built from the existing components, and its entry in `ADMIN_ROUTES` and `PAGES` (`ported: true`).
3. The routes of the page in `routes/admin.php` answer with `Admin\SpaController`; the Blade view, the old controller methods and the form
   routes go.
4. Tests: the API instead of the form (`tests/Integration/Admin`, `tests/Integration/Roles` show how).

Two things that cost an afternoon: a route parameter called `{user}` or `{server}` in the client API is taken over by `SubstituteClientBindings`
(use another name, as `{person}` in the role members route), and in a PHPUnit process a request to the client API changes how later requests
to Blade routes with `{user}` or a refused page are answered, so a test that does both should do the Blade request first.

## Trying it without a panel

`node preview/server.js` has mocks of the moved pages (`/admin`, `/admin/roles`, `/admin/locations`); the others are still drawn by the mock of
the old pages in `preview/admin.js`.
