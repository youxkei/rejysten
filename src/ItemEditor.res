open Belt

@module("uuid") external uuidv4: unit => string = "v4"
@send external focus: Dom.element => unit = "focus"
@get external value: Js.t<'a> => string = "value"

let indentItem = (itemsMap, item, text) => {
  let Item.Item({id, parent, prev, next}) = item

  switch itemsMap->HashMap.String.get(prev) {
  | Some(Item.Item({lastSubitem: prevLastSubitem})) => {
      open Firebase.Firestore

      let db = Firebase.firestore()
      let batch = db->batch
      let items = db->collection("items")

      if prevLastSubitem == "" {
        batch->addUpdate(items->doc(id), {"parent": prev, "prev": "", "next": "", "text": text})
        batch->addUpdate(items->doc(prev), {"next": next, "firstSubitem": id, "lastSubitem": id})
      } else {
        batch->addUpdate(
          items->doc(id),
          {"parent": prev, "prev": prevLastSubitem, "next": "", "text": text},
        )
        batch->addUpdate(items->doc(prev), {"next": next, "lastSubitem": id})
        batch->addUpdate(items->doc(prevLastSubitem), {"next": id})
      }

      if next == "" {
        if parent != "" {
          batch->addUpdate(items->doc(parent), {"lastSubitem": prev})
        }
      } else {
        batch->addUpdate(items->doc(next), {"prev": prev})
      }

      batch->commit
    }

  | _ => ()
  }
}

let unindentItem = (itemsMap, item, text) => {
  let Item.Item({id, parent, prev, next}) = item

  switch itemsMap->HashMap.String.get(parent) {
  | Some(Item.Item({parent: parentParent, next: parentNext})) => {
      open Firebase.Firestore

      let db = Firebase.firestore()
      let batch = db->batch
      let items = db->collection("items")

      batch->addUpdate(
        items->doc(id),
        {"parent": parentParent, "prev": parent, "next": parentNext, "text": text},
      )
      batch->addUpdate(items->doc(parent), {"next": id})

      if next == "" {
        batch->addUpdate(items->doc(parent), {"lastSubitem": prev})
      } else {
        batch->addUpdate(items->doc(next), {"prev": prev})
      }

      if prev == "" {
        batch->addUpdate(items->doc(parent), {"firstSubitem": next})
      } else {
        batch->addUpdate(items->doc(prev), {"next": next})
      }

      if parentNext == "" {
        if parentParent != "" {
          batch->addUpdate(items->doc(parentParent), {"lastSubitem": id})
        }
      } else {
        batch->addUpdate(items->doc(parentNext), {"prev": id})
      }

      batch->commit
    }

  | _ => ()
  }
}

let addItem = (document, item, text, setCursor) => {
  open Firebase.Firestore

  let db = Firebase.firestore()
  let batch = db->batch
  let items = db->collection("items")

  let Item.Item({id, parent, next}) = item

  let addingItemId = uuidv4()

  batch->addUpdate(items->doc(id), {"next": addingItemId, "text": text})

  batch->addSet(
    items->doc(addingItemId),
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
      batch->addUpdate(items->doc(parent), {"lastSubitem": addingItemId})
    }
  } else {
    batch->addUpdate(items->doc(next), {"prev": addingItemId})
  }

  batch->commit

  setCursor(_ => Atom.Cursor({id: addingItemId, editing: true}))
}

let deleteItem = (item, setCursor) => {
  open Firebase.Firestore

  let db = Firebase.firestore()
  let batch = db->batch
  let items = db->collection("items")

  let Item.Item({id, parent, prev, next}) = item

  batch->addDelete(items->doc(id))

  if prev == "" {
    if parent != "" {
      batch->addUpdate(items->doc(parent), {"firstSubitem": next})
    }
  } else {
    batch->addUpdate(items->doc(prev), {"next": next})
  }

  if next == "" {
    if parent != "" {
      batch->addUpdate(items->doc(parent), {"lastSubitem": prev})
    }
  } else {
    batch->addUpdate(items->doc(next), {"prev": prev})
  }

  batch->commit

  if prev == "" {
    if parent != "" {
      setCursor(_ => Atom.Cursor({id: parent, editing: true}))
    }
  } else {
    setCursor(_ => Atom.Cursor({id: prev, editing: true}))
  }
}

@react.component
let make = (~document, ~itemsMap, ~item) => {
  let Item.Item({id, text, firstSubitem, lastSubitem}) = item

  let (text, setText) = React.useState(_ => text)
  let (cursor, setCursor) = Recoil.useRecoilState(Atom.cursor)

  let itemsNum = itemsMap->HashMap.String.size

  let handleChange = event => {
    setText(_ => event->ReactEvent.Form.target->value)
  }

  let handleKeyDown = event => {
    open Firebase.Firestore
    let preventDefault = ReactEvent.Synthetic.preventDefault

    let keyCode = event->ReactEvent.Keyboard.keyCode
    let shiftKey = event->ReactEvent.Keyboard.shiftKey
    let ctrlKey = event->ReactEvent.Keyboard.ctrlKey

    Js.log(j`$keyCode, $shiftKey, $ctrlKey`)

    switch keyCode {
    | 27 => {
        Js.log(text)
        Firebase.firestore()->collection("items")->doc(id)->update({"text": text})
        setCursor(_ => Atom.Cursor({id: id, editing: false}))
      }

    | 9 if !shiftKey => {
        indentItem(itemsMap, item, text)
        event->preventDefault
      }

    | 9 if shiftKey => {
        unindentItem(itemsMap, item, text)
        event->preventDefault
      }

    | 13 if ctrlKey => {
        addItem(document, item, text, setCursor)
        event->preventDefault
      }

    | 8 if itemsNum > 2 && text == "" && firstSubitem == "" && lastSubitem == "" => {
        deleteItem(item, setCursor)
        event->preventDefault
      }

    | _ => ()
    }
  }

  let handleFocusOut = _ => {
    open Firebase.Firestore

    Firebase.firestore()->collection("items")->doc(id)->update({"text": text})
    setCursor(_ => Atom.Cursor({id: id, editing: false}))
  }

  let textareaRef = React.useRef(Js.Nullable.null)

  React.useEffect1(() => {
    switch cursor {
    | Cursor({id: itemId, editing}) if itemId == id && editing =>
      textareaRef.current->Js.Nullable.toOption->Option.forEach(textarea => textarea->focus)
    | _ => ()
    }
    None
  }, [cursor])

  <textarea
    value=text
    ref={ReactDOM.Ref.domRef(textareaRef)}
    onChange=handleChange
    onKeyDown=handleKeyDown
    onBlur=handleFocusOut
  />
}
