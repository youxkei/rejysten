@get external code: Dom.keyboardEvent => string = "code"
@get external shiftKey: Dom.keyboardEvent => bool = "shiftKey"
@get external ctrlKey: Dom.keyboardEvent => bool = "ctrlKey"
@send external preventDefault: Dom.keyboardEvent => unit = "preventDefault"

module KeyDownHandler = {
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
          dispatch(Action.DocumentItemPane(Action.ToDocumentPane()))
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
          dispatch(Action.DocumentItemPane(Action.ToInsertMode({initialCursorPosition: State.Start})))
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
          dispatch(Action.DocumentItemPane(Action.ToInsertMode({initialCursorPosition: State.Start})))

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
          dispatch(Action.FirestoreDocumentItemPane(Action.SaveItem()))
          dispatch(Action.DocumentItemPane(Action.ToNormalMode()))
        }

      | "Tab" if !ctrlKey && !shiftKey => {
          dispatch(Action.FirestoreDocumentItemPane(Action.IndentItem()))
          event->preventDefault
        }

      | "Tab" if !ctrlKey && shiftKey => {
          dispatch(Action.FirestoreDocumentItemPane(Action.UnindentItem()))
          event->preventDefault
        }

      | "Enter" if !ctrlKey && !shiftKey => {
          dispatch(Action.FirestoreDocumentItemPane(Action.AddItem({direction: Action.Next})))
          event->preventDefault
        }

      | "Backspace" if !ctrlKey && !shiftKey && state.documentItemPane.editingText == "" =>
        switch state->State.DocumentItemPane.current {
        | Some(currentItem) =>
          switch state->State.DocumentItemPane.above(currentItem) {
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

      | "Delete" if !ctrlKey && !shiftKey && state.documentItemPane.editingText == "" =>
        switch state->State.DocumentItemPane.current {
        | Some(currentItem) =>
          switch state->State.DocumentItemPane.below(currentItem) {
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

  module DocumentPane = {
    let normal = (store, event) => {
      let dispatch = Reductive.Store.dispatch(store)

      let code = event->code
      let ctrlKey = event->ctrlKey
      let shiftKey = event->shiftKey

      switch code {
      | "KeyJ" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentPane(Action.ToBelowDocument()))
          event->preventDefault
        }

      | "KeyK" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentPane(Action.ToAboveDocument()))
          event->preventDefault
        }

      | "KeyL" if !ctrlKey && !shiftKey => {
          dispatch(Action.DocumentPane(Action.ToDocumentItemPane()))
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
      | (State.DocumentPane, State.Normal) => KeyDownHandler.DocumentPane.normal(store, event)
      | (State.DocumentPane, State.Insert(_)) => KeyDownHandler.DocumentPane.insert(store, event)

      | (State.DocumentItemPane, State.Normal) => KeyDownHandler.DocumentItemPane.normal(store, event)
      | (State.DocumentItemPane, State.Insert(_)) => KeyDownHandler.DocumentItemPane.insert(store, event)
      }
    }

  | _ => next(action)
  }
}
