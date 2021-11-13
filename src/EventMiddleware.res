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
            switch state->State.Note.DocumentPane.selectedDocument {
            | Some(selectedDocument)
              if selectedDocument.firstChildId == "" && selectedDocument.lastChildId == "" =>
              switch state->State.Note.DocumentPane.aboveDocument(selectedDocument) {
              | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" =>
                switch state->State.Note.ItemPane.topItem {
                | Some({text: "", prevId: "", nextId: "", firstChildId: "", lastChildId: ""}) =>
                  dispatch(
                    Action.FirestoreNote(
                      Action.DocumentPane(
                        Action.DeleteDocument({
                          nextSelectedId: aboveId,
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
            switch state->State.Note.DocumentPane.selectedDocument {
            | Some(selectedDocument)
              if selectedDocument.firstChildId == "" && selectedDocument.lastChildId == "" =>
              switch state->State.Note.DocumentPane.belowDocument(selectedDocument) {
              | Some({id: belowId, parentId: belowParentId}) if belowParentId != "" =>
                switch state->State.Note.ItemPane.topItem {
                | Some({text: "", prevId: "", nextId: "", firstChildId: "", lastChildId: ""}) =>
                  dispatch(
                    Action.FirestoreNote(
                      Action.DocumentPane(
                        Action.DeleteDocument({
                          nextSelectedId: belowId,
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

          | "Backspace" if isNeutral && !shiftKey && state.itemEditor.editingText == "" =>
            switch state->State.Note.ItemPane.selectedItem {
            | Some(selectedItem)
              if selectedItem.firstChildId == "" && selectedItem.lastChildId == "" =>
              switch state->State.Note.ItemPane.aboveItem(selectedItem) {
              | Some({id: aboveId, parentId: aboveParentId}) if aboveParentId != "" => {
                  dispatch(
                    Action.FirestoreNote(
                      Action.ItemPane(
                        Action.DeleteItem({
                          nextSelectedId: aboveId,
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

          | "Delete" if isNeutral && !shiftKey && state.itemEditor.editingText == "" =>
            switch state->State.Note.ItemPane.selectedItem {
            | Some(selectedItem)
              if selectedItem.firstChildId == "" && selectedItem.lastChildId == "" =>
              switch state->State.Note.ItemPane.belowItem(selectedItem) {
              | Some({id: belowId, parentId: belowParentId}) if belowParentId != "" => {
                  dispatch(
                    Action.FirestoreNote(
                      Action.ItemPane(
                        Action.DeleteItem({
                          nextSelectedId: belowId,
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

        | "KeyK" if !ctrlKey && !shiftKey =>
          dispatch(Action.ActionLog(Action.ToAboveActionLog()))
          event->preventDefault

        | "KeyJ" if !ctrlKey && !shiftKey =>
          dispatch(Action.ActionLog(Action.ToBelowActionLog()))
          event->preventDefault

        | _ => ()
        }
      }
    }

    module Insert = {
      let handler = (_store, _event) => ()
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
              Action.SetSelectedDocument({id: documentId, initialCursorPosition: State.End()}),
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
              Action.SetSelectedItem({id: itemId, initialCursorPosition: State.End()}),
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
    let handler = (_store, _event, _isDouble, _target) => {
      ()
    }
  }

  module ActionLog = {
    let handler = (_store, _event, _isDouble, _target) => {
      ()
    }
  }
}

module Blur = {
  module Note = {
    module ItemPane = {
      let handler = (store, _event) => {
        let dispatch = Reductive.Store.dispatch(store)

        dispatch(Action.FirestoreNote(Action.ItemPane(Action.SaveItem())))
        dispatch(Action.Note(Action.ItemPane(Action.ToNormalMode())))
      }
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

      | (Event.Blur({event}), State.Note(State.ItemPane()), _) =>
        Blur.Note.ItemPane.handler(store, event)
      | (Event.Blur(_), State.Note(State.DocumentPane()), _) => ()
      | (Event.Blur(_), State.Search(), _) => ()
      | (Event.Blur(_), State.ActionLog(), _) => ()
      }
    }

  | _ => next(action)
  }
}
