# Armor trims in the player window

A piece of armor with a trim shows it on its icon in the inventory, the ender chest and shulker boxes, the way the game draws it: the icon of
the armor with the trim over it in the colour of the trim's material (gold, redstone, amethyst, ...). Armor made of the material of its own
trim (iron with an iron trim, diamond with a diamond trim, ...) gets the darker colour, like in the game. The pattern is not drawn on the icon:
the game does not draw it there either, a worn trim only shows its pattern on the player. The tooltip says which pattern and material it is,
like the game ("Coast Armor Trim", "Gold Material").

* The helper (Stratosphere plugin or mod) sends the trim with the item, so install it again from the player list if the colour is missing.
* The pictures are the ones of the game (`trims/items` and `trims/color_palettes` in the textures of the version, which come with the panel's
  tools, and are fetched by `tools/fetch-mc-textures.mjs` for 26.x). A material the game does not have (from a mod) has no colour and shows
  no trim.
