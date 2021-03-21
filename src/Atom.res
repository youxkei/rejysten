type cursor = Cursor({id: string, editing: bool}) | NoCursor

let cursor = Recoil.atom({
  "key": "cursor",
  "default": NoCursor,
})
