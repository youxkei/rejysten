@get external code: Dom.keyboardEvent => string = "code"
@get external shiftKey: Dom.keyboardEvent => bool = "shiftKey"
@get external ctrlKey: Dom.keyboardEvent => bool = "ctrlKey"
@send external preventDefault: Dom.keyboardEvent => unit = "preventDefault"

%%private(
  let normalModeKeyDownHandler = (store, event) => {
    let dispatch = Reductive.Store.dispatch(store)

    let code = event->code
    let ctrlKey = event->ctrlKey
    let shiftKey = event->shiftKey

    switch code {
    | "Tab" if !ctrlKey && !shiftKey => {
        dispatch(Action.FirestoreItem(Action.Indent))
        event->preventDefault
      }

    | "Tab" if !ctrlKey && shiftKey => {
        dispatch(Action.FirestoreItem(Action.Unindent))
        event->preventDefault
      }

    | "KeyH" if !ctrlKey => {
        dispatch(Action.MoveCursorLeft())
        event->preventDefault
      }

    | "KeyJ" if !ctrlKey => {
        dispatch(Action.MoveCursorDown())
        event->preventDefault
      }

    | "KeyK" if !ctrlKey => {
        dispatch(Action.MoveCursorUp())
        event->preventDefault
      }

    | "KeyL" if !ctrlKey => {
        dispatch(Action.MoveCursorRight())
        event->preventDefault
      }

    | "KeyI" if !ctrlKey => {
        dispatch(Action.ToInsertMode({initialCursorPosition: State.Start, itemId: None}))
        event->preventDefault
      }

    | "KeyA" if !ctrlKey => {
        dispatch(Action.ToInsertMode({initialCursorPosition: State.End, itemId: None}))
        event->preventDefault
      }

    | "KeyO" if !ctrlKey => {
        let direction = if shiftKey {
          Action.Prev
        } else {
          Action.Next
        }

        dispatch(Action.FirestoreItem(Action.Add({direction: direction})))
        dispatch(Action.ToInsertMode({initialCursorPosition: State.Start, itemId: None}))
        event->preventDefault
      }

    | _ => ()
    }
  }

  let insertModeKeyDownHandler = (store, event) => {
    let dispatch = Reductive.Store.dispatch(store)
    let state: State.t = Reductive.Store.getState(store)

    let code = event->code
    let ctrlKey = event->ctrlKey
    let shiftKey = event->shiftKey

    switch code {
    | "Escape" if !ctrlKey => {
        dispatch(Action.FirestoreItem(Action.Save))
        dispatch(Action.ToNormalMode())
      }

    | "Tab" if !ctrlKey && !shiftKey => {
        dispatch(Action.FirestoreItem(Action.Indent))
        event->preventDefault
      }

    | "Tab" if !ctrlKey && shiftKey => {
        dispatch(Action.FirestoreItem(Action.Unindent))
        event->preventDefault
      }

    | "Enter" if !ctrlKey && !shiftKey => {
        dispatch(Action.FirestoreItem(Action.Add({direction: Action.Next})))
        event->preventDefault
      }

    | "Backspace" if !ctrlKey =>
      switch state.focus {
      | State.DocumentItems => {
          let {documentItems: {currentId, map, editingText}} = state

          switch map->State.Item.get(currentId) {
          | Some(currentItem) if editingText == "" =>
            switch currentItem->State.Item.above(map) {
            | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
                dispatch(Action.FirestoreItem(Action.Delete))
                dispatch(
                  Action.SetCurrentDocumentItem({
                    id: aboveId,
                    initialCursorPosition: State.End,
                  }),
                )

                event->preventDefault
              }

            | _ => ()
            }

          | _ => ()
          }
        }

      | State.Documents => ()
      }

    | "Delete" if !ctrlKey =>
      switch state.focus {
      | State.DocumentItems => {
          let {documentItems: {currentId, map, editingText}} = state

          switch map->State.Item.get(currentId) {
          | Some(currentItem) if editingText == "" =>
            switch currentItem->State.Item.below(map) {
            | Some({id: belowId, parentId: belowParentId}) if belowParentId != "" => {
                dispatch(Action.FirestoreItem(Action.Delete))
                dispatch(
                  Action.SetCurrentDocumentItem({
                    id: belowId,
                    initialCursorPosition: State.Start,
                  }),
                )

                event->preventDefault
              }

            | _ => ()
            }

          | _ => ()
          }
        }

      | State.Documents => ()
      }

    | _ => ()
    }
  }
)

let middleware = (store, next, action) => {
  switch action {
  | Action.KeyDown({event}) => {
      let {mode}: State.t = Reductive.Store.getState(store)

      switch mode {
      | State.Normal => normalModeKeyDownHandler(store, event)

      | State.Insert(_) => insertModeKeyDownHandler(store, event)
      }
    }

  | _ => next(action)
  }
}
