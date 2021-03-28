type item =
  | Item({
      id: string,
      text: string,
      parent: string,
      prev: string,
      next: string,
      firstSubitem: string,
      lastSubitem: string,
    })

type document = Document({id: string, rootItem: string})

type mode = Normal | Insert

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
  | Insert => true
  }

let state = state => state

let currentItem = ({item: {currentId}}) => currentId
let itemsMap = ({item: {map}}) => map

let currentDocument = ({document: {currentId}}) => currentId
let documentsMap = ({document: {map}}) => map
