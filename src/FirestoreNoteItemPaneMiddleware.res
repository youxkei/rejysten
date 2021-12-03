@module("uuid") external uuidv4: unit => string = "v4"

let middleware = (store: Redux.Store.t, action: Action.firestoreNoteItemPane) => {
  let state = Reductive.Store.getState(store)

  switch action {
  | Action.SaveItem() =>
    switch state->Selector.Note.ItemPane.selectedItem {
    | Some({id}) =>
      switch state.mode {
      | State.Insert(_) =>
        open Firebase.Firestore

        Firebase.firestore->collection("items")->doc(id)->update({"text": state.editor.editingText})

      | _ => ()
      }

    | _ => ()
    }

  | Action.IndentItem() =>
    switch state->Selector.Note.ItemPane.selectedItem {
    | Some({id, parentId, prevId, nextId}) =>
      open Firebase.Firestore

      let db = Firebase.firestore
      let writeBatch = db->writeBatch
      let items = db->collection("items")

      switch state.mode {
      | State.Insert(_) => writeBatch->addUpdate(items->doc(id), {"text": state.editor.editingText})

      | _ => ()
      }

      switch state->Selector.Firestore.getItem(prevId) {
      | Some({lastChildId: prevLastChildId}) =>
        if prevLastChildId == "" {
          writeBatch->addUpdate(items->doc(id), {"parentId": prevId, "prevId": "", "nextId": ""})
          writeBatch->addUpdate(
            items->doc(prevId),
            {"nextId": nextId, "firstChildId": id, "lastChildId": id},
          )
        } else {
          writeBatch->addUpdate(
            items->doc(id),
            {"parentId": prevId, "prevId": prevLastChildId, "nextId": ""},
          )
          writeBatch->addUpdate(items->doc(prevId), {"nextId": nextId, "lastChildId": id})
          writeBatch->addUpdate(items->doc(prevLastChildId), {"nextId": id})
        }

        if nextId == "" {
          if parentId != "" {
            writeBatch->addUpdate(items->doc(parentId), {"lastChildId": prevId})
          }
        } else {
          writeBatch->addUpdate(items->doc(nextId), {"prevId": prevId})
        }

      | _ => ()
      }

      writeBatch->commit

    | _ => ()
    }

  | Action.DedentItem() =>
    switch state->Selector.Note.ItemPane.selectedItem {
    | Some({id, parentId, prevId, nextId}) =>
      open Firebase.Firestore

      let db = Firebase.firestore
      let writeBatch = db->writeBatch
      let items = db->collection("items")

      switch state.mode {
      | State.Insert(_) => writeBatch->addUpdate(items->doc(id), {"text": state.editor.editingText})

      | _ => ()
      }

      switch state->Selector.Firestore.getItem(parentId) {
      | Some({parentId: parentParentId, nextId: parentNextId}) =>
        if parentParentId != "" {
          writeBatch->addUpdate(
            items->doc(id),
            {
              "parentId": parentParentId,
              "prevId": parentId,
              "nextId": parentNextId,
            },
          )
          writeBatch->addUpdate(items->doc(parentId), {"nextId": id})

          if nextId == "" {
            writeBatch->addUpdate(items->doc(parentId), {"lastChildId": prevId})
          } else {
            writeBatch->addUpdate(items->doc(nextId), {"prevId": prevId})
          }

          if prevId == "" {
            writeBatch->addUpdate(items->doc(parentId), {"firstChildId": nextId})
          } else {
            writeBatch->addUpdate(items->doc(prevId), {"nextId": nextId})
          }

          if parentNextId == "" {
            if parentParentId != "" {
              writeBatch->addUpdate(items->doc(parentParentId), {"lastChildId": id})
            }
          } else {
            writeBatch->addUpdate(items->doc(parentNextId), {"prevId": id})
          }
        }

      | _ => ()
      }

      writeBatch->commit

    | _ => ()
    }

  | Action.AddItem({direction}) =>
    switch state->Selector.Note.ItemPane.selectedItem {
    | Some({id, parentId, prevId, nextId}) => {
        open Firebase.Firestore

        let db = Firebase.firestore
        let writeBatch = db->writeBatch
        let items = db->collection("items")

        let addingItemId = uuidv4()

        switch state.mode {
        | State.Insert(_) =>
          writeBatch->addUpdate(items->doc(id), {"text": state.editor.editingText})

        | _ => ()
        }

        switch direction {
        | Action.Prev() => {
            writeBatch->addUpdate(items->doc(id), {"prevId": addingItemId})

            writeBatch->addSet(
              items->doc(addingItemId),
              {
                "documentId": state.note.documentPane.selectedId,
                "text": "",
                "parentId": parentId,
                "prevId": prevId,
                "nextId": id,
                "firstChildId": "",
                "lastChildId": "",
              },
            )

            if prevId == "" {
              if parentId != "" {
                writeBatch->addUpdate(items->doc(parentId), {"firstChildId": addingItemId})
              }
            } else {
              writeBatch->addUpdate(items->doc(prevId), {"nextId": addingItemId})
            }
          }

        | Action.Next() => {
            writeBatch->addUpdate(items->doc(id), {"nextId": addingItemId})

            writeBatch->addSet(
              items->doc(addingItemId),
              {
                "documentId": state.note.documentPane.selectedId,
                "text": "",
                "parentId": parentId,
                "prevId": id,
                "nextId": nextId,
                "firstChildId": "",
                "lastChildId": "",
              },
            )

            if nextId == "" {
              if parentId != "" {
                writeBatch->addUpdate(items->doc(parentId), {"lastChildId": addingItemId})
              }
            } else {
              writeBatch->addUpdate(items->doc(nextId), {"prevId": addingItemId})
            }
          }
        }

        writeBatch->commit

        Reductive.Store.dispatch(
          store,
          Action.Note(
            Action.ItemPane(
              Action.SetSelectedItem({id: addingItemId, initialCursorPosition: State.Start()}),
            ),
          ),
        )
      }

    | _ => ()
    }

  | Action.DeleteItem({nextSelectedId, initialCursorPosition}) =>
    switch state->Selector.Note.ItemPane.selectedItem {
    | Some(item) => {
        open Firebase.Firestore

        let {id, parentId, prevId, nextId} = item

        let db = Firebase.firestore
        let writeBatch = db->writeBatch
        let items = db->collection("items")

        writeBatch->addDelete(items->doc(id))

        if prevId == "" {
          if parentId != "" {
            writeBatch->addUpdate(items->doc(parentId), {"firstChildId": nextId})
          }
        } else {
          writeBatch->addUpdate(items->doc(prevId), {"nextId": nextId})
        }

        if nextId == "" {
          if parentId != "" {
            writeBatch->addUpdate(items->doc(parentId), {"lastChildId": prevId})
          }
        } else {
          writeBatch->addUpdate(items->doc(nextId), {"prevId": prevId})
        }

        Reductive.Store.dispatch(
          store,
          Action.Note(
            Action.ItemPane(
              Action.SetSelectedItem({
                id: nextSelectedId,
                initialCursorPosition: initialCursorPosition,
              }),
            ),
          ),
        )

        writeBatch->commit
      }

    | _ => ()
    }
  }
}
