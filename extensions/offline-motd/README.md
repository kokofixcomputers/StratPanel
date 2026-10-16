# Offline MOTD

Choose what players see in the server list, and when they try to join, while a server is off.

- **Admin:** Admin > Extensions > Offline MOTD > Settings: the message, the text where the version is, whether owners may set
  their own, and whether it is also used for servers that are asleep (auto sleep).
- **Owners:** a card on the Settings page of their server.
- **How it works:** the router (`tools/mc-router`) asks the panel what to show for a server that it cannot reach. This extension
  adds `notice` to that answer through the `router.state` hook, and the router shows it instead of its own words.

It is also the example of an extension that touches everything: a backend hook, routes of its own, settings that the admin page
makes a form of, a store for its data, and a part in the browser.
