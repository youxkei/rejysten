open Belt

@module("firebase/app") external firebase: 'any = "default"

%%private(
  let keyCode = ReactEvent.Keyboard.keyCode
  let shiftKey = ReactEvent.Keyboard.shiftKey
  let target = ReactEvent.Form.target
  let preventDefault = ReactEvent.Synthetic.preventDefault
)

let indentItem = (itemsMap, item) => {
  let Item.Item({id, parent, prev, next}) = item

  switch itemsMap->HashMap.String.get(prev) {
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

      switch itemsMap->HashMap.String.get(parent) {
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
  let Item.Item({id, parent, prev, next, firstSubitem, lastSubitem}) = item

  switch itemsMap->HashMap.String.get(parent) {
  | Some(Item.Item({
      parent: parentParent,
      next: parentNext,
      firstSubitem: parentFirstSubitem,
      lastSubitem: parentLastSubitem,
    })) => {
      let db = firebase["firestore"]()
      let batch = db["batch"]()
      let items = db["collection"]("items")

      batch["update"](items["doc"](id), {"parent": parentParent, "prev": parent, "next": parentNext})

      if next == "" {
        batch["update"](items["doc"](parent), {"next": id, "firstSubitem": "", "lastSubitem": ""})
      } else {
        batch["update"](items["doc"](parent), {"next": id, "firstSubitem": next})
      }

      if parentNext != "" {
        batch["update"](items["doc"](parentNext), {"prev": id})
      }

      switch itemsMap->HashMap.String.get(parentParent) {
      | Some(Item.Item({lastSubitem})) if lastSubitem == parent =>
        batch["update"](items["doc"](parentParent), {"lastSubitem": id})

      | _ => ()
      }

      batch["commit"]()
    }

  | _ => ()
  }
}

@react.component
let make = (~itemsMap, ~item) => {
  let Item.Item({id, text}) = item

  let (text, setText) = React.useState(() => text)

  let handleChange = event => {
    setText(target(event)["value"])
  }

  let handleKeyDown = event => {
    let keyCode = keyCode(event)
    let shiftKey = shiftKey(event)

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

    | _ => ()
    }
  }

  <textarea value=text onChange=handleChange onKeyDown=handleKeyDown />
}
