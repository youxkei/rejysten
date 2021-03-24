module Item = {
  type cursor = Cursor({id: string, editing: bool}) | NoCursor

  let cursor = Recoil.atom({
    "key": "itemCursor",
    "default": NoCursor,
  })

  let cursorId = Recoil.selector({
    "key": "itemCursorId",
    "get": ({Recoil.get: get}) =>
      switch get(cursor) {
      | Cursor({id}) => id
      | NoCursor => ""
      },
  })

  let cursorEditing = Recoil.selector({
    "key": "itemCursorEditing",
    "get": ({Recoil.get: get}) => {
      switch get(cursor) {
      | Cursor({editing}) => editing
      | NoCursor => false
      }
    },
  })
}

module Document = {
  type cursor = Cursor({id: string}) | NoCursor

  let cursor = Recoil.atom({
    "key": "documentCursor",
    "default": Cursor({id: "NdxNjoPpHTuFjfhRDUth"}),
  })


  let cursorId = Recoil.selector({
    "key": "cursorId",
    "get": ({Recoil.get: get}) =>
      switch get(cursor) {
      | Cursor({id}) => id
      | NoCursor => ""
      },
  })
}
