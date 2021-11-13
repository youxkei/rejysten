@module("uuid") external uuidv4: unit => string = "v4"

let middleware = (store: Redux.Store.t, action: Action.firestoreNoteDocumentPane) => {
  let state = Reductive.Store.getState(store)

  switch action {
  | Action.SaveDocument() =>
    switch state->State.Note.DocumentPane.selectedDocument {
    | Some({id}) =>
      switch state.mode {
      | State.Insert(_) =>
        open Firebase.Firestore

        Firebase.firestore
        ->collection("documents")
        ->doc(id)
        ->update({"text": state.note.documentPane.editingText})

      | State.Normal() => ()
      }

    | None => ()
    }

  | Action.IndentDocument() =>
    switch state->State.Note.DocumentPane.selectedDocument {
    | Some({id, parentId, prevId, nextId}) =>
      open Firebase.Firestore

      let db = Firebase.firestore
      let writeBatch = db->writeBatch
      let documents = db->collection("documents")

      switch state.mode {
      | State.Insert(_) =>
        writeBatch->addUpdate(documents->doc(id), {"text": state.note.documentPane.editingText})

      | State.Normal() => ()
      }

      switch state->State.Firestore.getDocument(prevId) {
      | Some({lastChildId: prevLastChildId}) =>
        if prevLastChildId == "" {
          writeBatch->addUpdate(
            documents->doc(id),
            {"parentId": prevId, "prevId": "", "nextId": ""},
          )
          writeBatch->addUpdate(
            documents->doc(prevId),
            {"nextId": nextId, "firstChildId": id, "lastChildId": id},
          )
        } else {
          writeBatch->addUpdate(
            documents->doc(id),
            {"parentId": prevId, "prevId": prevLastChildId, "nextId": ""},
          )
          writeBatch->addUpdate(documents->doc(prevId), {"nextId": nextId, "lastChildId": id})
          writeBatch->addUpdate(documents->doc(prevLastChildId), {"nextId": id})
        }

        if nextId == "" {
          if parentId != "" {
            writeBatch->addUpdate(documents->doc(parentId), {"lastChildId": prevId})
          }
        } else {
          writeBatch->addUpdate(documents->doc(nextId), {"prevId": prevId})
        }

      | _ => ()
      }

      writeBatch->commit

    | None => ()
    }

  | Action.UnindentDocument() =>
    switch state->State.Note.DocumentPane.selectedDocument {
    | Some({id, parentId, prevId, nextId}) =>
      open Firebase.Firestore

      let db = Firebase.firestore
      let writeBatch = db->writeBatch
      let documents = db->collection("documents")

      switch state.mode {
      | State.Insert(_) =>
        writeBatch->addUpdate(documents->doc(id), {"text": state.note.documentPane.editingText})

      | _ => ()
      }

      switch state->State.Firestore.getDocument(parentId) {
      | Some({parentId: parentParentId, nextId: parentNextId}) =>
        if parentParentId != "" {
          writeBatch->addUpdate(
            documents->doc(id),
            {
              "parentId": parentParentId,
              "prevId": parentId,
              "nextId": parentNextId,
            },
          )
          writeBatch->addUpdate(documents->doc(parentId), {"nextId": id})

          if nextId == "" {
            writeBatch->addUpdate(documents->doc(parentId), {"lastChildId": prevId})
          } else {
            writeBatch->addUpdate(documents->doc(nextId), {"prevId": prevId})
          }

          if prevId == "" {
            writeBatch->addUpdate(documents->doc(parentId), {"firstChildId": nextId})
          } else {
            writeBatch->addUpdate(documents->doc(prevId), {"nextId": nextId})
          }

          if parentNextId == "" {
            if parentParentId != "" {
              writeBatch->addUpdate(documents->doc(parentParentId), {"lastChildId": id})
            }
          } else {
            writeBatch->addUpdate(documents->doc(parentNextId), {"prevId": id})
          }
        }

      | _ => ()
      }

      writeBatch->commit

    | _ => ()
    }

  | Action.AddDocument({direction}) =>
    switch state->State.Note.DocumentPane.selectedDocument {
    | Some({id, parentId, prevId, nextId}) => {
        open Firebase.Firestore

        let db = Firebase.firestore
        let writeBatch = db->writeBatch
        let items = db->collection("items")
        let documents = db->collection("documents")

        let addingDocumentId = uuidv4()
        let addingRootItemId = uuidv4()
        let addingItemId = uuidv4()

        switch state.mode {
        | State.Insert(_) =>
          writeBatch->addUpdate(documents->doc(id), {"text": state.note.documentPane.editingText})

        | _ => ()
        }

        switch direction {
        | Action.Prev() => {
            writeBatch->addUpdate(documents->doc(id), {"prevId": addingDocumentId})

            writeBatch->addSet(
              documents->doc(addingDocumentId),
              {
                "rootItemId": addingRootItemId,
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
                writeBatch->addUpdate(documents->doc(parentId), {"firstChildId": addingDocumentId})
              }
            } else {
              writeBatch->addUpdate(documents->doc(prevId), {"nextId": addingDocumentId})
            }
          }

        | Action.Next() => {
            writeBatch->addUpdate(documents->doc(id), {"nextId": addingDocumentId})

            writeBatch->addSet(
              documents->doc(addingDocumentId),
              {
                "rootItemId": addingRootItemId,
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
                writeBatch->addUpdate(documents->doc(parentId), {"lastChildId": addingDocumentId})
              }
            } else {
              writeBatch->addUpdate(documents->doc(nextId), {"prevId": addingDocumentId})
            }
          }
        }

        writeBatch->addSet(
          items->doc(addingRootItemId),
          {
            "documentId": addingDocumentId,
            "text": "",
            "parentId": "",
            "prevId": "",
            "nextId": "",
            "firstChildId": addingItemId,
            "lastChildId": addingItemId,
          },
        )

        writeBatch->addSet(
          items->doc(addingItemId),
          {
            "documentId": addingDocumentId,
            "text": "",
            "parentId": addingRootItemId,
            "prevId": "",
            "nextId": "",
            "firstChildId": "",
            "lastChildId": "",
          },
        )

        writeBatch->commit

        Reductive.Store.dispatch(
          store,
          Action.Note(
            Action.DocumentPane(
              Action.SetSelectedDocument({
                id: addingDocumentId,
                initialCursorPosition: State.Start(),
              }),
            ),
          ),
        )
      }

    | _ => ()
    }

  | Action.DeleteDocument({nextSelectedId, initialCursorPosition}) =>
    switch state->State.Note.DocumentPane.selectedDocument {
    | Some(selectedDocument) =>
      switch state->State.Note.ItemPane.rootItem {
      | Some({id: rootItemId, firstChildId}) =>
        switch state->State.Firestore.getItem(firstChildId) {
        | Some({id: firstChildItemId}) =>
          open Firebase.Firestore

          let {id, parentId, prevId, nextId} = selectedDocument

          let db = Firebase.firestore
          let writeBatch = db->writeBatch
          let documents = db->collection("documents")
          let items = db->collection("items")

          writeBatch->addDelete(documents->doc(id))
          writeBatch->addDelete(items->doc(rootItemId))
          writeBatch->addDelete(items->doc(firstChildItemId))

          if prevId == "" {
            if parentId != "" {
              writeBatch->addUpdate(documents->doc(parentId), {"firstChildId": nextId})
            }
          } else {
            writeBatch->addUpdate(documents->doc(prevId), {"nextId": nextId})
          }

          if nextId == "" {
            if parentId != "" {
              writeBatch->addUpdate(documents->doc(parentId), {"lastChildId": prevId})
            }
          } else {
            writeBatch->addUpdate(documents->doc(nextId), {"prevId": prevId})
          }

          Reductive.Store.dispatch(
            store,
            Action.Note(
              Action.DocumentPane(
                Action.SetSelectedDocument({
                  id: nextSelectedId,
                  initialCursorPosition: initialCursorPosition,
                }),
              ),
            ),
          )

          writeBatch->commit

        | None => ()
        }

      | None => ()
      }

    | _ => ()
    }
  }
}
