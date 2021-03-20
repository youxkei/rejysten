type focus = FocusOnDocument(string) | FocusOnItem(string) | NoFocus

let focus = Recoil.atom({"key": "focus", "default": FocusOnItem("2c760b46-dd0e-49b1-b8e8-af319416e863")})
