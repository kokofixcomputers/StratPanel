# Hide sensitive information

Account settings has a switch, **Hide sensitive information** (off by default), for streaming, screen sharing and screenshots. While it is on, what could point at a person or a server is
blurred (the real text is in the page, with a CSS blur that clears while the pointer or keyboard focus is on it; text that cannot be blurred, like console lines and tooltips, shows dots such as `••••.••••.••••:••••`), and a small crossed-out eye in the top bar says so (a click turns it off).

**What is hidden**
* IP addresses and addresses of servers: the server list, the connection address on the console page and in the sidebar, the network page, the SFTP address and username, database
  endpoints, hosts and usernames, the addresses on the proxy page.
* Domains of a server and the DNS records shown for them.
* Email addresses: your own (account page and menu, the email field is blurred), the ones of subusers, and the actor of an entry of the activity log.
* The activity log: the IP address of every entry, and addresses and emails inside the details of an entry (also the metadata window).
* The console: IP addresses and email addresses in the lines of the log, such as where a player logged in from. Lines already on the screen are drawn again when the switch is turned on or off.

**Good to know**
* It only changes what is shown. **Copying a value (a click on an address) still copies the real one**, so something can be pasted off camera; nothing is changed on the panel.
* The setting belongs to the browser (local storage), not to the account, so a streaming computer can have it on and other devices not. It follows between tabs of the same browser.
* The admin area (`/admin`) is a separate set of pages and does not have it.
* Names of players and servers are shown as they are, they are not addresses. The field where an email address or a server address is typed in, and passwords that are revealed on purpose, are not hidden.
* The search of the dashboard still finds a server by its address when you type it, and the Tools tab, the player inventory and files are not changed.
* The code is `lib/privacy.ts` (the setting and how a value is turned into dots), `components/elements/Sensitive.tsx` (for text, and the blur of a field) and `lib/privacy.spec.ts`.
