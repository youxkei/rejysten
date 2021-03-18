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
)

let indentItem = (itemsMap, item) => {
  let Item.Item({id, parent, prev, next}) = item

  switch itemsMap->get(prev) {
  | Some(Item.Item({lastSubitem: prevLastSubitem})) => {
      let db = firebase["firestore"]()
      let batch = db["batch"]()
      let items = db["collection"]("items")

      if prevLastSubitem == "" {
        batch["update"](items["doc"](id), {"parent": prev, "prev": "", "next": ""})
        batch["update"](items["doc"](prev), {"next": next, "firstSubitem": id, "lastSubitem": id})
      } else {
        batch["update"](items["doc"](id), {"parent": prev, "prev": prevLastSubitem, "next": ""})
        batch["update"](items["doc"](prev), {"next": next, "lastSubitem": id})
        batch["update"](items["doc"](prevLastSubitem), {"next": id})
      }

      if next != "" {
        batch["update"](items["doc"](next), {"prev": prev})
      }

      switch itemsMap->get(parent) {
      | Some(Item.Item({lastSubitem})) if lastSubitem == id =>
        batch["update"](items["doc"](parent), {"lastSubitem": prev})

      | _ => ()
      }

      batch["commit"]()
    }

  | _ => ()
  }
}

let unindentItem = (itemsMap, item) => {
  let Item.Item({id, parent, prev, next}) = item

  switch itemsMap->get(parent) {
  | Some(Item.Item({
      parent: parentParent,
      next: parentNext,
      firstSubitem: parentFirstSubitem,
      lastSubitem: parentLastSubitem,
    })) =>
    switch itemsMap->get(parentParent) {
    | Some(Item.Item({lastSubitem: parentParentLastSubitem})) => {
        let db = firebase["firestore"]()
        let batch = db["batch"]()
        let items = db["collection"]("items")

        batch["update"](
          items["doc"](id),
          {"parent": parentParent, "prev": parent, "next": parentNext},
        )
        batch["update"](items["doc"](parent), {"next": id})

        if next == "" {
          batch["update"](items["doc"](parent), {"lastSubitem": prev})
        } else {
          batch["update"](items["doc"](next), {"prev": prev})
        }

        if prev == "" {
          batch["update"](items["doc"](parent), {"firstSubitem": next})
        } else {
          batch["update"](items["doc"](prev), {"next": next})
        }

        if parentNext != "" {
          batch["update"](items["doc"](parentNext), {"prev": id})
        }

        if parentParentLastSubitem == parent {
          batch["update"](items["doc"](parentParent), {"lastSubitem": id})
        }

        batch["commit"]()
      }

    | _ => ()
    }

  | _ => ()
  }
}

let addItem = (document, itemsMap, item) => {
  let db = firebase["firestore"]()
  let batch = db["batch"]()
  let items = db["collection"]("items")

  let Item.Item({id, parent, next}) = item


  let addingItemId = uuidv4()

  batch["update"](items["doc"](id), {"next": addingItemId})

  batch["set"](
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
      batch["update"](items["doc"](parent), {"lastSubitem": addingItemId})
    } else {
      Js.Exn.raiseError("addItem: there should be a parent item")
    }
  } else {
    batch["update"](items["doc"](next), {"prev": addingItemId})
  }

  batch["commit"]()
}

@react.component
let make = (~document, ~itemsMap, ~item) => {
  let Item.Item({id, text}) = item

  let (text, setText) = React.useState(() => text)

  let handleChange = event => {
    setText(target(event)["value"])
  }

  let handleKeyDown = event => {
    let keyCode = event->keyCode
    let shiftKey = event->shiftKey
    let ctrlKey = event->ctrlKey

    Js.log((keyCode, shiftKey))

    switch keyCode {
    | 27 => firebase["firestore"]()["collection"]("items")["doc"](id)["update"]({"text": text})

    | 9 if !shiftKey => {
        indentItem(itemsMap, item)
        event->preventDefault
      }

    | 9 if shiftKey => {
        unindentItem(itemsMap, item)
        event->preventDefault
      }

    | 13 if ctrlKey => {
        addItem(document, itemsMap, item)
        event->preventDefault
      }

    | _ => ()
    }
  }

  <textarea value=text onChange=handleChange onKeyDown=handleKeyDown />
}
