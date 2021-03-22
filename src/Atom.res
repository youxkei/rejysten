type cursor = Cursor({id: string, editing: bool}) | NoCursor

let cursor = Recoil.atom({
  "key": "cursor",
  "default": NoCursor,
})

let cursorId = Recoil.selector({
  "key": "cursorId",
  "get": ({Recoil.get: get}) =>
    switch get(cursor) {
    | Cursor({id}) => id
    | NoCursor => ""
    },
})

let cursorEditing = Recoil.selector({
  "key": "cursorEditing",
  "get": ({Recoil.get: get}) => {
    switch get(cursor) {
    | Cursor({editing}) => editing
    | NoCursor => false
    }
  },
})
