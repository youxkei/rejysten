@get external code: Dom.keyboardEvent => string = "code"
@get external shiftKey: Dom.keyboardEvent => bool = "shiftKey"
@get external ctrlKey: Dom.keyboardEvent => bool = "ctrlKey"
@get external isComposing: Dom.keyboardEvent => bool = "isComposing"
@send external preventDefault: Dom.keyboardEvent => unit = "preventDefault"

module KeyDown = {
  module Note = {
    module DocumentPane = {
      module Normal = {
        let handler = (store, event) => {
          let dispatch = Reductive.Store.dispatch(store)

          let code = event->code
          let ctrlKey = event->ctrlKey
          let shiftKey = event->shiftKey

          switch code {
          | "Tab" if !ctrlKey && !shiftKey => {
              dispatch(Action.FirestoreNote(Action.DocumentPane(Action.IndentDocument())))
              event->preventDefault
            }

          | "Tab" if !ctrlKey && shiftKey => {
              dispatch(Action.FirestoreNote(Action.DocumentPane(Action.UnindentDocument())))
              event->preventDefault
            }

          | "KeyJ" if !ctrlKey && !shiftKey => {
              dispatch(Action.Note(Action.DocumentPane(Action.ToBelowDocument())))
              event->preventDefault
            }

          | "KeyK" if !ctrlKey && !shiftKey => {
              dispatch(Action.Note(Action.DocumentPane(Action.ToAboveDocument())))
              event->preventDefault
            }

          | "KeyL" if !ctrlKey && !shiftKey => {
              dispatch(Action.FocusNote(Action.ItemPane()))
              event->preventDefault
            }

          | "KeyO" if !ctrlKey => {
              let direction = if shiftKey {
                Action.Prev()
              } else {
                Action.Next()
              }

              dispatch(
                Action.FirestoreNote(
                  Action.DocumentPane(Action.AddDocument({direction: direction})),
                ),
              )
              dispatch(
                Action.Note(
                  Action.DocumentPane(Action.ToInsertMode({initialCursorPosition: State.Start()})),
                ),
              )
            }

          | "KeyI" if !ctrlKey && !shiftKey => {
              dispatch(
                Action.Note(
                  Action.DocumentPane(Action.ToInsertMode({initialCursorPosition: State.Start()})),
                ),
              )
              event->preventDefault
            }

          | "KeyA" if !ctrlKey && !shiftKey => {
              dispatch(
                Action.Note(
                  Action.DocumentPane(Action.ToInsertMode({initialCursorPosition: State.End()})),
                ),
              )
              event->preventDefault
            }

          | "KeyO" if !ctrlKey => {
              let direction = if shiftKey {
                Action.Prev()
              } else {
                Action.Next()
              }

              dispatch(
                Action.FirestoreNote(
                  Action.DocumentPane(Action.AddDocument({direction: direction})),
                ),
              )
              dispatch(
                Action.Note(
                  Action.DocumentPane(Action.ToInsertMode({initialCursorPosition: State.Start()})),
                ),
              )

              event->preventDefault
            }

          | "KeyL" if !ctrlKey && shiftKey => {
              dispatch(Action.FocusActionLog())
              event->preventDefault
            }

          | "Slash" if !ctrlKey && !shiftKey => {
              dispatch(Action.FocusSearch())
              event->preventDefault
            }

          | _ => ()
          }
        }
      }

      module Insert = {
        let handler = (store, event) => {
          let dispatch = Reductive.Store.dispatch(store)
          let state: State.t = Reductive.Store.getState(store)

          let code = event->code
          let ctrlKey = event->ctrlKey
          let shiftKey = event->shiftKey
          let isComposing = event->isComposing
          let isNeutral = !ctrlKey && !isComposing

          switch code {
          | "Escape" if isNeutral && !shiftKey =>
            dispatch(Action.FirestoreNote(Action.DocumentPane(Action.SaveDocument())))
            dispatch(Action.Note(Action.DocumentPane(Action.ToNormalMode())))

          | "Tab" if isNeutral && !shiftKey =>
            dispatch(Action.FirestoreNote(Action.DocumentPane(Action.IndentDocument())))
            event->preventDefault

          | "Tab" if isNeutral && shiftKey =>
            dispatch(Action.FirestoreNote(Action.DocumentPane(Action.UnindentDocument())))
            event->preventDefault

          | "Enter" if isNeutral && !shiftKey =>
            dispatch(
              Action.FirestoreNote(
                Action.DocumentPane(Action.AddDocument({direction: Action.Next()})),
              ),
            )
            event->preventDefault

          | "Backspace" if isNeutral && !shiftKey && state.note.documentPane.editingText == "" =>
            switch state->State.Note.DocumentPane.currentDocument {
            | Some(currentDocument)
              if currentDocument.firstChildId == "" && currentDocument.lastChildId == "" =>
              switch state->State.Note.DocumentPane.aboveDocument(currentDocument) {
              | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" =>
                switch state->State.Note.ItemPane.topItem {
                | Some({text: "", prevId: "", nextId: "", firstChildId: "", lastChildId: ""}) =>
                  dispatch(
                    Action.FirestoreNote(
                      Action.DocumentPane(
                        Action.DeleteDocument({
                          nextCurrentId: aboveId,
                          initialCursorPosition: State.End(),
                        }),
                      ),
                    ),
                  )

                  event->preventDefault

                | _ => ()
                }

              | _ => ()
              }

            | _ => ()
            }

          | "Delete" if isNeutral && !shiftKey && state.note.documentPane.editingText == "" =>
            switch state->State.Note.DocumentPane.currentDocument {
            | Some(currentDocument)
              if currentDocument.firstChildId == "" && currentDocument.lastChildId == "" =>
              switch state->State.Note.DocumentPane.belowDocument(currentDocument) {
              | Some({id: belowId, parentId: belowParentId}) if belowParentId != "" =>
                switch state->State.Note.ItemPane.topItem {
                | Some({text: "", prevId: "", nextId: "", firstChildId: "", lastChildId: ""}) =>
                  dispatch(
                    Action.FirestoreNote(
                      Action.DocumentPane(
                        Action.DeleteDocument({
                          nextCurrentId: belowId,
                          initialCursorPosition: State.Start(),
                        }),
                      ),
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
    }

    module DocumentItemPane = {
      module Normal = {
        let handler = (store, event) => {
          let dispatch = Reductive.Store.dispatch(store)

          let code = event->code
          let ctrlKey = event->ctrlKey
          let shiftKey = event->shiftKey

          switch code {
          | "Tab" if !ctrlKey && !shiftKey => {
              dispatch(Action.FirestoreNote(Action.ItemPane(Action.IndentItem())))
              event->preventDefault
            }

          | "Tab" if !ctrlKey && shiftKey => {
              dispatch(Action.FirestoreNote(Action.ItemPane(Action.UnindentItem())))
              event->preventDefault
            }

          | "KeyH" if !ctrlKey && !shiftKey => {
              dispatch(Action.FocusNote(Action.DocumentPane()))
              event->preventDefault
            }

          | "KeyJ" if !ctrlKey && !shiftKey => {
              dispatch(Action.Note(Action.ItemPane(Action.ToBelowItem())))
              event->preventDefault
            }

          | "KeyK" if !ctrlKey && !shiftKey => {
              dispatch(Action.Note(Action.ItemPane(Action.ToAboveItem())))
              event->preventDefault
            }

          | "KeyI" if !ctrlKey && !shiftKey => {
              dispatch(
                Action.Note(
                  Action.ItemPane(Action.ToInsertMode({initialCursorPosition: State.Start()})),
                ),
              )
              event->preventDefault
            }

          | "KeyA" if !ctrlKey && !shiftKey => {
              dispatch(
                Action.Note(
                  Action.ItemPane(Action.ToInsertMode({initialCursorPosition: State.End()})),
                ),
              )
              event->preventDefault
            }

          | "KeyO" if !ctrlKey => {
              let direction = if shiftKey {
                Action.Prev()
              } else {
                Action.Next()
              }

              dispatch(
                Action.FirestoreNote(Action.ItemPane(Action.AddItem({direction: direction}))),
              )
              dispatch(
                Action.Note(
                  Action.ItemPane(Action.ToInsertMode({initialCursorPosition: State.Start()})),
                ),
              )

              event->preventDefault
            }

          | "KeyG" if !ctrlKey =>
            if shiftKey {
              dispatch(Action.Note(Action.ItemPane(Action.ToBottomItem())))
            } else {
              dispatch(Action.Note(Action.ItemPane(Action.ToTopItem())))
            }

          | "KeyL" if !ctrlKey && shiftKey => {
              dispatch(Action.FocusActionLog())
              event->preventDefault
            }

          | "Slash" if !ctrlKey && !shiftKey => {
              dispatch(Action.FocusSearch())
              event->preventDefault
            }

          | _ => ()
          }
        }
      }

      module Insert = {
        let handler = (store, event) => {
          let dispatch = Reductive.Store.dispatch(store)
          let state: State.t = Reductive.Store.getState(store)

          let code = event->code
          let ctrlKey = event->ctrlKey
          let shiftKey = event->shiftKey
          let isComposing = event->isComposing
          let isNeutral = !ctrlKey && !isComposing

          switch code {
          | "Escape" if isNeutral && !shiftKey => {
              dispatch(Action.FirestoreNote(Action.ItemPane(Action.SaveItem())))
              dispatch(Action.Note(Action.ItemPane(Action.ToNormalMode())))
            }

          | "Tab" if isNeutral && !shiftKey => {
              dispatch(Action.FirestoreNote(Action.ItemPane(Action.IndentItem())))
              event->preventDefault
            }

          | "Tab" if isNeutral && shiftKey => {
              dispatch(Action.FirestoreNote(Action.ItemPane(Action.UnindentItem())))
              event->preventDefault
            }

          | "Enter" if isNeutral && !shiftKey => {
              dispatch(
                Action.FirestoreNote(Action.ItemPane(Action.AddItem({direction: Action.Next()}))),
              )
              event->preventDefault
            }

          | "Backspace" if isNeutral && !shiftKey && state.note.itemPane.editingText == "" =>
            switch state->State.Note.ItemPane.currentItem {
            | Some(currentItem)
              if currentItem.firstChildId == "" && currentItem.lastChildId == "" =>
              switch state->State.Note.ItemPane.aboveItem(currentItem) {
              | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
                  dispatch(
                    Action.FirestoreNote(
                      Action.ItemPane(
                        Action.DeleteItem({
                          nextCurrentId: aboveId,
                          initialCursorPosition: State.End(),
                        }),
                      ),
                    ),
                  )

                  event->preventDefault
                }

              | _ => ()
              }

            | _ => ()
            }

          | "Delete" if isNeutral && !shiftKey && state.note.itemPane.editingText == "" =>
            switch state->State.Note.ItemPane.currentItem {
            | Some(currentItem)
              if currentItem.firstChildId == "" && currentItem.lastChildId == "" =>
              switch state->State.Note.ItemPane.belowItem(currentItem) {
              | Some({id: belowId, parentId: belowParentId}) if belowParentId != "" => {
                  dispatch(
                    Action.FirestoreNote(
                      Action.ItemPane(
                        Action.DeleteItem({
                          nextCurrentId: belowId,
                          initialCursorPosition: State.Start(),
                        }),
                      ),
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
    }
  }

  module Search = {
    module Normal = {
      let handler = (store, event) => {
        let dispatch = Reductive.Store.dispatch(store)

        let code = event->code

        switch code {
        | "Escape" => dispatch(Action.FocusNote(Action.ItemPane()))

        | _ => ()
        }
      }
    }

    module Insert = {
      let handler = (_store, _event) => {
        ()
      }
    }
  }

  module ActionLog = {
    module Normal = {
      let handler = (store, event) => {
        let dispatch = Reductive.Store.dispatch(store)

        let code = event->code
        let ctrlKey = event->ctrlKey
        let shiftKey = event->shiftKey

        switch code {
        | "KeyN" if !ctrlKey && shiftKey =>
          dispatch(Action.FocusNote(Action.ItemPane()))
          event->preventDefault

        | _ => ()
        }
      }
    }

    module Insert = {
      let handler = (store, event) => ()
    }
  }
}

module Click = {
  module Note = {
    let handler = (store, _event, isDouble, target) => {
      let dispatch = Reductive.Store.dispatch(store)

      switch target {
      | Event.Document(documentId) =>
        dispatch(Action.FocusNote(Action.DocumentPane()))
        dispatch(
          Action.Note(
            Action.DocumentPane(
              Action.SetCurrentDocument({id: documentId, initialCursorPosition: State.End()}),
            ),
          ),
        )

        if isDouble {
          dispatch(
            Action.Note(
              Action.DocumentPane(Action.ToInsertMode({initialCursorPosition: State.End()})),
            ),
          )
        } else {
          dispatch(Action.Note(Action.DocumentPane(Action.ToNormalMode())))
        }

      | Event.Item(itemId) =>
        dispatch(Action.FocusNote(Action.ItemPane()))
        dispatch(
          Action.Note(
            Action.ItemPane(
              Action.SetCurrentItem({id: itemId, initialCursorPosition: State.End()}),
            ),
          ),
        )

        if isDouble {
          dispatch(
            Action.Note(Action.ItemPane(Action.ToInsertMode({initialCursorPosition: State.End()}))),
          )
        } else {
          dispatch(Action.Note(Action.ItemPane(Action.ToNormalMode())))
        }
      }
    }
  }

  module Search = {
    let handler = (store, event, isDouble, target) => {
      ()
    }
  }

  module ActionLog = {
    let handler = (store, event, isDouble, target) => {
      ()
    }
  }
}

let middleware = (store, next, action) => {
  switch action {
  | Action.Event(event) => {
      let {focus, mode}: State.t = Reductive.Store.getState(store)

      switch (event, focus, mode) {
      | (Event.KeyDown({event}), State.Note(State.DocumentPane()), State.Normal()) =>
        KeyDown.Note.DocumentPane.Normal.handler(store, event)
      | (Event.KeyDown({event}), State.Note(State.DocumentPane()), State.Insert(_)) =>
        KeyDown.Note.DocumentPane.Insert.handler(store, event)

      | (Event.KeyDown({event}), State.Note(State.ItemPane()), State.Normal()) =>
        KeyDown.Note.DocumentItemPane.Normal.handler(store, event)
      | (Event.KeyDown({event}), State.Note(State.ItemPane()), State.Insert(_)) =>
        KeyDown.Note.DocumentItemPane.Insert.handler(store, event)

      | (Event.KeyDown({event}), State.Search(), State.Normal()) =>
        KeyDown.Search.Normal.handler(store, event)
      | (Event.KeyDown({event}), State.Search(), State.Insert(_)) =>
        KeyDown.Search.Insert.handler(store, event)

      | (Event.KeyDown({event}), State.ActionLog(), State.Normal()) =>
        KeyDown.ActionLog.Normal.handler(store, event)
      | (Event.KeyDown({event}), State.ActionLog(), State.Insert(_)) =>
        KeyDown.ActionLog.Insert.handler(store, event)

      | (Event.Click({event, isDouble, target}), State.Note(State.DocumentPane()), _) =>
        Click.Note.handler(store, event, isDouble, target)
      | (Event.Click({event, isDouble, target}), State.Note(State.ItemPane()), _) =>
        Click.Note.handler(store, event, isDouble, target)
      | (Event.Click({event, isDouble, target}), State.Search(), _) =>
        Click.Search.handler(store, event, isDouble, target)
      | (Event.Click({event, isDouble, target}), State.ActionLog(), _) =>
        Click.ActionLog.handler(store, event, isDouble, target)
      }
    }

  | _ => next(action)
  }
}
