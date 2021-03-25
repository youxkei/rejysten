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

type document = | Document({id: string, rootItem: string})

type item_state = {
  current: string,
  map: Belt.HashMap.String.t<item>,
}

type document_state = {
  current: string,
  map: Belt.HashMap.String.t<document>,
}

type t = {
  editing: bool,
  item: item_state,
  document: document_state,
}

let initialState: t = {
  editing: false,
  item: {
    current: "",
    map: Belt.HashMap.String.make(~hintSize=0)
  },
  document: {
    current: "NdxNjoPpHTuFjfhRDUth",
    map: Belt.HashMap.String.make(~hintSize=0)
  }
}

let editing = ({editing}) => editing

let currentItem = ({item: {current}}) => current
let itemsMap = ({item: {map}}) => map

let currentDocument = ({document: {current}}) => current
let documentsMap = ({document: {map}}) => map
