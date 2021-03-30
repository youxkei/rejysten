type item =
  | Item({
      id: string,
      text: string,
      parentId: string,
      prevId: string,
      nextId: string,
      firstSubitemId: string,
      lastSubitemId: string,
    })

type document = Document({id: string, rootItemId: string})

type initial_cursor_position = Start | End

type mode = Normal | Insert({initialCursorPosition: initial_cursor_position})

type item_state = {
  currentId: string,
  map: Belt.HashMap.String.t<item>,
}

type document_state = {
  currentId: string,
  map: Belt.HashMap.String.t<document>,
}

type t = {
  mode: mode,
  item: item_state,
  document: document_state,
}

let initialState: t = {
  mode: Normal,
  item: {
    currentId: "",
    map: Belt.HashMap.String.make(~hintSize=0),
  },
  document: {
    currentId: "NdxNjoPpHTuFjfhRDUth",
    map: Belt.HashMap.String.make(~hintSize=0),
  },
}

let editing = ({mode}) =>
  switch mode {
  | Normal => false
  | Insert(_) => true
  }

let state = state => state
let mode = ({mode}) => mode
let currentDocumentId = ({document: {currentId}}) => currentId
