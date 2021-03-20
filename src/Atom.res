type cursor = Cursor({id: string, editing: bool}) | NoCursor

let cursor = Recoil.atom({
  "key": "cursor",
  "default": Cursor({id: "2c760b46-dd0e-49b1-b8e8-af319416e863", editing: true}),
})
