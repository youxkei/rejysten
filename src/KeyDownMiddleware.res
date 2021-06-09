@get external code: Dom.keyboardEvent => string = "code"
@get external shiftKey: Dom.keyboardEvent => bool = "shiftKey"
@get external ctrlKey: Dom.keyboardEvent => bool = "ctrlKey"
@get external isComposing: Dom.keyboardEvent => bool = "isComposing"
@send external preventDefault: Dom.keyboardEvent => unit = "preventDefault"

module KeyDownHandler = {
  module DocumentPane = {
    let normal = (store, event) => {
      let dispatch = Reductive.Store.dispatch(store)

      let code = event->code
      let ctrlKey = event->ctrlKey
      let shiftKey = event->shiftKey

      switch code {
      | "Tab" if !ctrlKey && !shiftKey => {
          dispatch(Action.FirestoreDocumentPane(Action.IndentDocument()))
          event->preventDefault
        }

      | "Tab" if !ctrlKey && shiftKey => {
          dispatch(Action.FirestoreDocumentPane(Action.UnindentDocument()))
          event->preventDefault
        }

      | "KeyJ" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentPane(Action.ToBelowDocument()))
          event->preventDefault
        }

      | "KeyK" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentPane(Action.ToAboveDocument()))
          event->preventDefault
        }

      | "KeyL" if !ctrlKey && !shiftKey => {
          dispatch(Action.FocusDocumentItemPane())
          event->preventDefault
        }

      | "KeyO" if !ctrlKey => {
          let direction = if shiftKey {
            Action.Prev
          } else {
            Action.Next
          }

          dispatch(Action.FirestoreDocumentPane(Action.AddDocument({direction: direction})))
          dispatch(Action.DocumentPane(Action.ToInsertMode({initialCursorPosition: State.Start})))
        }

      | "KeyI" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentPane(Action.ToInsertMode({initialCursorPosition: State.Start})))
          event->preventDefault
        }

      | "KeyA" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentPane(Action.ToInsertMode({initialCursorPosition: State.End})))
          event->preventDefault
        }

      | "KeyO" if !ctrlKey => {
          let direction = if shiftKey {
            Action.Prev
          } else {
            Action.Next
          }

          dispatch(Action.FirestoreDocumentPane(Action.AddDocument({direction: direction})))
          dispatch(Action.DocumentPane(Action.ToInsertMode({initialCursorPosition: State.Start})))

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
      let isComposing = event->isComposing
      let isNeutral = !ctrlKey && !isComposing

      switch code {
      | "Escape" if isNeutral && !shiftKey =>
        dispatch(Action.FirestoreDocumentPane(Action.SaveDocument()))
        dispatch(Action.DocumentPane(Action.ToNormalMode()))

      | "Tab" if isNeutral && !shiftKey =>
        dispatch(Action.FirestoreDocumentPane(Action.IndentDocument()))
        event->preventDefault

      | "Tab" if isNeutral && shiftKey =>
        dispatch(Action.FirestoreDocumentPane(Action.UnindentDocument()))
        event->preventDefault

      | "Enter" if isNeutral && !shiftKey =>
        dispatch(Action.FirestoreDocumentPane(Action.AddDocument({direction: Action.Next})))
        event->preventDefault

      | "Backspace" if isNeutral && !shiftKey && state.documentPane.editingText == "" =>
        switch state->State.DocumentPane.currentDocument {
        | Some(currentDocument)
          if currentDocument.firstChildId == "" && currentDocument.lastChildId == "" =>
          switch state->State.DocumentPane.aboveDocument(currentDocument) {
          | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" =>
            switch state->State.DocumentItemPane.topItem {
            | Some({text: "", prevId: "", nextId: "", firstChildId: "", lastChildId: ""}) =>
              dispatch(
                Action.FirestoreDocumentPane(
                  Action.DeleteDocument({
                    nextCurrentId: aboveId,
                    initialCursorPosition: State.End,
                  }),
                ),
              )

              event->preventDefault

            | _ => ()
            }

          | _ => ()
          }

        | _ => ()
        }

      | "Delete" if isNeutral && !shiftKey && state.documentPane.editingText == "" =>
        switch state->State.DocumentPane.currentDocument {
        | Some(currentDocument)
          if currentDocument.firstChildId == "" && currentDocument.lastChildId == "" =>
          switch state->State.DocumentPane.belowDocument(currentDocument) {
          | Some({id: belowId, parentId: belowParentId}) if belowParentId != "" =>
            switch state->State.DocumentItemPane.topItem {
            | Some({text: "", prevId: "", nextId: "", firstChildId: "", lastChildId: ""}) =>
              dispatch(
                Action.FirestoreDocumentPane(
                  Action.DeleteDocument({
                    nextCurrentId: belowId,
                    initialCursorPosition: State.Start,
                  }),
                ),
              )

              event->preventDefault

            | _ => ()
            }

          | _ => ()
          }

        | _ => ()
        }

      | _ => ()
      }
    }
  }

  module DocumentItemPane = {
    let normal = (store, event) => {
      let dispatch = Reductive.Store.dispatch(store)

      let code = event->code
      let ctrlKey = event->ctrlKey
      let shiftKey = event->shiftKey

      switch code {
      | "Tab" if !ctrlKey && !shiftKey => {
          dispatch(Action.FirestoreDocumentItemPane(Action.IndentItem()))
          event->preventDefault
        }

      | "Tab" if !ctrlKey && shiftKey => {
          dispatch(Action.FirestoreDocumentItemPane(Action.UnindentItem()))
          event->preventDefault
        }

      | "KeyH" if !ctrlKey && !shiftKey => {
          dispatch(Action.FocusDocumentPane())
          event->preventDefault
        }

      | "KeyJ" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentItemPane(Action.ToBelowItem()))
          event->preventDefault
        }

      | "KeyK" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentItemPane(Action.ToAboveItem()))
          event->preventDefault
        }

      | "KeyI" if !ctrlKey && !shiftKey => {
          dispatch(
            Action.DocumentItemPane(Action.ToInsertMode({initialCursorPosition: State.Start})),
          )
          event->preventDefault
        }

      | "KeyA" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentItemPane(Action.ToInsertMode({initialCursorPosition: State.End})))
          event->preventDefault
        }

      | "KeyO" if !ctrlKey => {
          let direction = if shiftKey {
            Action.Prev
          } else {
            Action.Next
          }

          dispatch(Action.FirestoreDocumentItemPane(Action.AddItem({direction: direction})))
          dispatch(
            Action.DocumentItemPane(Action.ToInsertMode({initialCursorPosition: State.Start})),
          )

          event->preventDefault
        }

      | "KeyG" if !ctrlKey =>
        if shiftKey {
          dispatch(Action.DocumentItemPane(Action.ToBottomItem()))
        } else {
          dispatch(Action.DocumentItemPane(Action.ToTopItem()))
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
      let isComposing = event->isComposing
      let isNeutral = !ctrlKey && !isComposing

      switch code {
      | "Escape" if isNeutral && !shiftKey => {
          dispatch(Action.FirestoreDocumentItemPane(Action.SaveItem()))
          dispatch(Action.DocumentItemPane(Action.ToNormalMode()))
        }

      | "Tab" if isNeutral && !shiftKey => {
          dispatch(Action.FirestoreDocumentItemPane(Action.IndentItem()))
          event->preventDefault
        }

      | "Tab" if isNeutral && shiftKey => {
          dispatch(Action.FirestoreDocumentItemPane(Action.UnindentItem()))
          event->preventDefault
        }

      | "Enter" if isNeutral && !shiftKey => {
          dispatch(Action.FirestoreDocumentItemPane(Action.AddItem({direction: Action.Next})))
          event->preventDefault
        }

      | "Backspace" if isNeutral && !shiftKey && state.documentItemPane.editingText == "" =>
        switch state->State.DocumentItemPane.currentItem {
        | Some(currentItem) if currentItem.firstChildId == "" && currentItem.lastChildId == "" =>
          switch state->State.DocumentItemPane.aboveItem(currentItem) {
          | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
              dispatch(
                Action.FirestoreDocumentItemPane(
                  Action.DeleteItem({nextCurrentId: aboveId, initialCursorPosition: State.End}),
                ),
              )

              event->preventDefault
            }

          | _ => ()
          }

        | _ => ()
        }

      | "Delete" if isNeutral && !shiftKey && state.documentItemPane.editingText == "" =>
        switch state->State.DocumentItemPane.currentItem {
        | Some(currentItem) if currentItem.firstChildId == "" && currentItem.lastChildId == "" =>
          switch state->State.DocumentItemPane.belowItem(currentItem) {
          | Some({id: belowId, parentId: belowParentId}) if belowParentId != "" => {
              dispatch(
                Action.FirestoreDocumentItemPane(
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

  module SearchPane = {
    let normal = (_store, _event) => {
      ()
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
      | (State.DocumentPane, State.Normal) => KeyDownHandler.DocumentPane.normal(store, event)
      | (State.DocumentPane, State.Insert(_)) => KeyDownHandler.DocumentPane.insert(store, event)

      | (State.DocumentItemPane, State.Normal) =>
        KeyDownHandler.DocumentItemPane.normal(store, event)
      | (State.DocumentItemPane, State.Insert(_)) =>
        KeyDownHandler.DocumentItemPane.insert(store, event)

      | (State.SearchPane, State.Normal) => KeyDownHandler.SearchPane.normal(store, event)
      | (State.SearchPane, State.Insert(_)) => KeyDownHandler.SearchPane.insert(store, event)
      }
    }

  | _ => next(action)
  }
}
