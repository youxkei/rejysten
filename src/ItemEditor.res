open Belt

@module("firebase/app") external firebase: 'any = "default"
@module("uuid") external uuidv4: unit => string = "v4"

%%private(
  let keyCode = ReactEvent.Keyboard.keyCode
  let shiftKey = ReactEvent.Keyboard.shiftKey
  let ctrlKey = ReactEvent.Keyboard.ctrlKey

  let target = ReactEvent.Form.target

  let preventDefault = ReactEvent.Synthetic.preventDefault

  let get = HashMap.String.get
  let size = HashMap.String.size
)

let indentItem = (itemsMap, item, text) => {
  let Item.Item({id, parent, prev, next}) = item

  switch itemsMap->get(prev) {
  | Some(Item.Item({lastSubitem: prevLastSubitem})) => {
      let db = firebase["firestore"]()
      let batch = db["batch"]()
      let items = db["collection"]("items")

      if prevLastSubitem == "" {
        let () = batch["update"](
          items["doc"](id),
          {"parent": prev, "prev": "", "next": "", "text": text},
        )
        let () = batch["update"](
          items["doc"](prev),
          {"next": next, "firstSubitem": id, "lastSubitem": id},
        )
      } else {
        let () = batch["update"](
          items["doc"](id),
          {"parent": prev, "prev": prevLastSubitem, "next": "", "text": text},
        )
        let () = batch["update"](items["doc"](prev), {"next": next, "lastSubitem": id})
        let () = batch["update"](items["doc"](prevLastSubitem), {"next": id})
      }

      if next != "" {
        let () = batch["update"](items["doc"](next), {"prev": prev})
      }

      switch itemsMap->get(parent) {
      | Some(Item.Item({lastSubitem})) if lastSubitem == id =>
        let () = batch["update"](items["doc"](parent), {"lastSubitem": prev})

      | _ => ()
      }

      let () = batch["commit"]()
    }

  | _ => ()
  }
}

let unindentItem = (itemsMap, item, text) => {
  let Item.Item({id, parent, prev, next}) = item

  switch itemsMap->get(parent) {
  | Some(Item.Item({parent: parentParent, next: parentNext})) =>
    switch itemsMap->get(parentParent) {
    | Some(Item.Item({lastSubitem: parentParentLastSubitem})) => {
        let db = firebase["firestore"]()
        let batch = db["batch"]()
        let items = db["collection"]("items")

        let () = batch["update"](
          items["doc"](id),
          {"parent": parentParent, "prev": parent, "next": parentNext, "text": text},
        )
        let () = batch["update"](items["doc"](parent), {"next": id})

        if next == "" {
          let () = batch["update"](items["doc"](parent), {"lastSubitem": prev})
        } else {
          let () = batch["update"](items["doc"](next), {"prev": prev})
        }

        if prev == "" {
          let () = batch["update"](items["doc"](parent), {"firstSubitem": next})
        } else {
          let () = batch["update"](items["doc"](prev), {"next": next})
        }

        if parentNext != "" {
          let () = batch["update"](items["doc"](parentNext), {"prev": id})
        }

        if parentParentLastSubitem == parent {
          let () = batch["update"](items["doc"](parentParent), {"lastSubitem": id})
        }

        let () = batch["commit"]()
      }

    | _ => ()
    }

  | _ => ()
  }
}

let addItem = (document, item, text) => {
  let db = firebase["firestore"]()
  let batch = db["batch"]()
  let items = db["collection"]("items")

  let Item.Item({id, parent, next}) = item

  let addingItemId = uuidv4()

  let () = batch["update"](items["doc"](id), {"next": addingItemId, "text": text})

  let () = batch["set"](
    items["doc"](addingItemId),
    {
      "document": document,
      "text": "",
      "parent": parent,
      "prev": id,
      "next": next,
      "firstSubitem": "",
      "lastSubitem": "",
    },
  )

  if next == "" {
    if parent != "" {
      let () = batch["update"](items["doc"](parent), {"lastSubitem": addingItemId})
    } else {
      Js.Exn.raiseError(j`addItem: there should be a parent of $item`)
    }
  } else {
    let () = batch["update"](items["doc"](next), {"prev": addingItemId})
  }

  let () = batch["commit"]()
}

let deleteItem = item => {
  let db = firebase["firestore"]()
  let batch = db["batch"]()
  let items = db["collection"]("items")

  let Item.Item({id, parent, prev, next}) = item

  let () = batch["delete"](items["doc"](id))

  if prev == "" {
    if parent != "" {
      let () = batch["update"](items["doc"](parent), {"firstSubitem": next})
    }
  } else {
    let () = batch["update"](items["doc"](prev), {"next": next})
  }

  if next == "" {
    if parent != "" {
      let () = batch["update"](items["doc"](parent), {"lastSubitem": prev})
    }
  } else {
    let () = batch["update"](items["doc"](next), {"prev": prev})
  }

  let () = batch["commit"]()
}

@react.component
let make = (~document, ~itemsMap, ~item) => {
  let itemsNum = itemsMap->size

  let Item.Item({id, text, firstSubitem, lastSubitem}) = item

  let (text, setText) = React.useState(() => text)

  let handleChange = event => {
    setText(target(event)["value"])
  }

  let handleKeyDown = event => {
    let keyCode = event->keyCode
    let shiftKey = event->shiftKey
    let ctrlKey = event->ctrlKey

    Js.log(j`$keyCode, $shiftKey`)

    switch keyCode {
    | 27 => firebase["firestore"]()["collection"]("items")["doc"](id)["update"]({"text": text})

    | 9 if !shiftKey => {
        indentItem(itemsMap, item, text)
        event->preventDefault
      }

    | 9 if shiftKey => {
        unindentItem(itemsMap, item, text)
        event->preventDefault
      }

    | 13 if ctrlKey => {
        addItem(document, item, text)
        event->preventDefault
      }

    | 8 if itemsNum > 2 && text == "" && firstSubitem == "" && lastSubitem == "" => {
      deleteItem(item)
      event->preventDefault
    }

    | _ => ()
    }
  }

  <textarea value=text onChange=handleChange onKeyDown=handleKeyDown />
}
