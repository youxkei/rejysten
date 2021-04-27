@get external code: Dom.keyboardEvent => string = "code"
@get external shiftKey: Dom.keyboardEvent => bool = "shiftKey"
@get external ctrlKey: Dom.keyboardEvent => bool = "ctrlKey"
@send external preventDefault: Dom.keyboardEvent => unit = "preventDefault"

module KeyDownHandler = {
  module DocumentItems = {
    let normal = (store, event) => {
      let dispatch = Reductive.Store.dispatch(store)

      let code = event->code
      let ctrlKey = event->ctrlKey
      let shiftKey = event->shiftKey

      switch code {
      | "Tab" if !ctrlKey && !shiftKey => {
          dispatch(Action.FirestoreDocumentItems(Action.IndentItem()))
          event->preventDefault
        }

      | "Tab" if !ctrlKey && shiftKey => {
          dispatch(Action.FirestoreDocumentItems(Action.UnindentItem()))
          event->preventDefault
        }

      | "KeyH" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentItems(Action.ToDocuments()))
          event->preventDefault
        }

      | "KeyJ" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentItems(Action.ToBelowItem()))
          event->preventDefault
        }

      | "KeyK" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentItems(Action.ToAboveItem()))
          event->preventDefault
        }

      | "KeyI" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentItems(Action.ToInsertMode({initialCursorPosition: State.Start})))
          event->preventDefault
        }

      | "KeyA" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentItems(Action.ToInsertMode({initialCursorPosition: State.End})))
          event->preventDefault
        }

      | "KeyO" if !ctrlKey => {
          let direction = if shiftKey {
            Action.Prev
          } else {
            Action.Next
          }

          dispatch(Action.FirestoreDocumentItems(Action.AddItem({direction: direction})))
          dispatch(Action.DocumentItems(Action.ToInsertMode({initialCursorPosition: State.Start})))

          event->preventDefault
        }

      | _ => ()
      }
    }

    let insert = (store, event) => {
      let dispatch = Reductive.Store.dispatch(store)
      let state: State.t = Reductive.Store.getState(store)

      let code = event->code
      let ctrlKey = event->ctrlKey
      let shiftKey = event->shiftKey

      switch code {
      | "Escape" if !ctrlKey && !shiftKey => {
          dispatch(Action.FirestoreDocumentItems(Action.SaveItem()))
          dispatch(Action.DocumentItems(Action.ToNormalMode()))
        }

      | "Tab" if !ctrlKey && !shiftKey => {
          dispatch(Action.FirestoreDocumentItems(Action.IndentItem()))
          event->preventDefault
        }

      | "Tab" if !ctrlKey && shiftKey => {
          dispatch(Action.FirestoreDocumentItems(Action.UnindentItem()))
          event->preventDefault
        }

      | "Enter" if !ctrlKey && !shiftKey => {
          dispatch(Action.FirestoreDocumentItems(Action.AddItem({direction: Action.Next})))
          event->preventDefault
        }

      | "Backspace" if !ctrlKey && !shiftKey =>
        let {documentItems: {currentId, map, editingText}} = state

        switch map->State.Item.get(currentId) {
        | Some(currentItem) if editingText == "" =>
          switch currentItem->State.Item.above(map) {
          | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
              dispatch(
                Action.FirestoreDocumentItems(
                  Action.DeleteItem({nextCurrentId: aboveId, initialCursorPosition: State.End}),
                ),
              )

              event->preventDefault
            }

          | _ => ()
          }

        | _ => ()
        }

      | "Delete" if !ctrlKey && !shiftKey =>
        let {documentItems: {currentId, map, editingText}} = state

        switch map->State.Item.get(currentId) {
        | Some(currentItem) if editingText == "" =>
          switch currentItem->State.Item.below(map) {
          | Some({id: belowId, parentId: belowParentId}) if belowParentId != "" => {
              dispatch(
                Action.FirestoreDocumentItems(
                  Action.DeleteItem({nextCurrentId: belowId, initialCursorPosition: State.Start}),
                ),
              )

              event->preventDefault
            }

          | _ => ()
          }

        | _ => ()
        }

      | _ => ()
      }
    }
  }

  module Documents = {
    let normal = (store, event) => {
      let dispatch = Reductive.Store.dispatch(store)

      let code = event->code
      let ctrlKey = event->ctrlKey
      let shiftKey = event->shiftKey

      switch code {
      | "KeyJ" if !ctrlKey && !shiftKey => {
          dispatch(Action.Documents(Action.ToBelowDocument()))
          event->preventDefault
        }

      | "KeyK" if !ctrlKey && !shiftKey => {
          dispatch(Action.Documents(Action.ToAboveDocument()))
          event->preventDefault
        }

      | "KeyL" if !ctrlKey && !shiftKey => {
          dispatch(Action.Documents(Action.ToDocumentItems()))
          event->preventDefault
        }

      | _ => ()
      }
    }

    let insert = (_store, _event) => {
      ()
    }
  }
}

let middleware = (store, next, action) => {
  switch action {
  | Action.KeyDown({event}) => {
      let {focus, mode}: State.t = Reductive.Store.getState(store)

      switch (focus, mode) {
      | (State.DocumentItems, State.Normal) => KeyDownHandler.DocumentItems.normal(store, event)
      | (State.DocumentItems, State.Insert(_)) => KeyDownHandler.DocumentItems.insert(store, event)

      | (State.Documents, State.Normal) => KeyDownHandler.Documents.normal(store, event)
      | (State.Documents, State.Insert(_)) => KeyDownHandler.Documents.insert(store, event)
      }
    }

  | _ => next(action)
  }
}
