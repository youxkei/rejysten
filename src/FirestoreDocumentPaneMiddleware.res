@module("uuid") external uuidv4: unit => string = "v4"

let middleware = (store: Redux.Store.t, action: Action.firestoreDocumentPane) => {
  let state = Reductive.Store.getState(store)

  switch action {
  | Action.SaveDocument() =>
    switch state->State.DocumentPane.current {
    | Some({id}) =>
      switch state.mode {
      | State.Insert(_) =>
        open Firebase.Firestore

        Firebase.firestore()
        ->collection("documents")
        ->doc(id)
        ->update({"text": state.documentPane.editingText})

      | State.Normal => ()
      }

    | None => ()
    }

  | Action.IndentDocument() =>
    switch state->State.DocumentPane.current {
    | Some({id, parentId, prevId, nextId}) =>
      open Firebase.Firestore

      let db = Firebase.firestore()
      let batch = db->batch
      let documents = db->collection("documents")

      switch state.mode {
      | State.Insert(_) =>
        batch->addUpdate(documents->doc(id), {"text": state.documentPane.editingText})

      | State.Normal => ()
      }

      switch state->State.DocumentPane.get(prevId) {
      | Some({lastChildId: prevLastChildId}) =>
        if prevLastChildId == "" {
          batch->addUpdate(documents->doc(id), {"parentId": prevId, "prevId": "", "nextId": ""})
          batch->addUpdate(
            documents->doc(prevId),
            {"nextId": nextId, "firstChildId": id, "lastChildId": id},
          )
        } else {
          batch->addUpdate(
            documents->doc(id),
            {"parentId": prevId, "prevId": prevLastChildId, "nextId": ""},
          )
          batch->addUpdate(documents->doc(prevId), {"nextId": nextId, "lastChildId": id})
          batch->addUpdate(documents->doc(prevLastChildId), {"nextId": id})
        }

        if nextId == "" {
          if parentId != "" {
            batch->addUpdate(documents->doc(parentId), {"lastChildId": prevId})
          }
        } else {
          batch->addUpdate(documents->doc(nextId), {"prevId": prevId})
        }

      | _ => ()
      }

      batch->commit

    | None => ()
    }

  | Action.UnindentDocument() =>
    switch state->State.DocumentPane.current {
    | Some({id, parentId, prevId, nextId}) =>
      open Firebase.Firestore

      let db = Firebase.firestore()
      let batch = db->batch
      let documents = db->collection("documents")

      switch state.mode {
      | State.Insert(_) =>
        batch->addUpdate(documents->doc(id), {"text": state.documentPane.editingText})

      | _ => ()
      }

      switch state->State.DocumentPane.get(parentId) {
      | Some({parentId: parentParentId, nextId: parentNextId}) =>
        if parentParentId != "" {
          batch->addUpdate(
            documents->doc(id),
            {
              "parentId": parentParentId,
              "prevId": parentId,
              "nextId": parentNextId,
            },
          )
          batch->addUpdate(documents->doc(parentId), {"nextId": id})

          if nextId == "" {
            batch->addUpdate(documents->doc(parentId), {"lastChildId": prevId})
          } else {
            batch->addUpdate(documents->doc(nextId), {"prevId": prevId})
          }

          if prevId == "" {
            batch->addUpdate(documents->doc(parentId), {"firstChildId": nextId})
          } else {
            batch->addUpdate(documents->doc(prevId), {"nextId": nextId})
          }

          if parentNextId == "" {
            if parentParentId != "" {
              batch->addUpdate(documents->doc(parentParentId), {"lastChildId": id})
            }
          } else {
            batch->addUpdate(documents->doc(parentNextId), {"prevId": id})
          }
        }

      | _ => ()
      }

      batch->commit

    | _ => ()
    }

  | Action.AddDocument({direction}) =>
    switch state->State.DocumentPane.current {
    | Some({id, parentId, prevId, nextId}) => {
        open Firebase.Firestore

        let db = Firebase.firestore()
        let batch = db->batch
        let items = db->collection("items")
        let documents = db->collection("documents")

        let addingDocumentId = uuidv4()
        let addingRootItemId = uuidv4()
        let addingItemId = uuidv4()

        switch state.mode {
        | State.Insert(_) =>
          batch->addUpdate(documents->doc(id), {"text": state.documentPane.editingText})

        | _ => ()
        }

        switch direction {
        | Action.Prev => {
            batch->addUpdate(documents->doc(id), {"prevId": addingDocumentId})

            batch->addSet(
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
                batch->addUpdate(documents->doc(parentId), {"firstChildId": addingDocumentId})
              }
            } else {
              batch->addUpdate(documents->doc(prevId), {"nextId": addingDocumentId})
            }
          }

        | Action.Next => {
            batch->addUpdate(documents->doc(id), {"nextId": addingDocumentId})

            batch->addSet(
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
                batch->addUpdate(documents->doc(parentId), {"lastChildId": addingDocumentId})
              }
            } else {
              batch->addUpdate(documents->doc(nextId), {"prevId": addingDocumentId})
            }
          }
        }

        batch->addSet(
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

        batch->addSet(
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

        batch->commit

        Reductive.Store.dispatch(
          store,
          Action.DocumentPane(
            Action.SetCurrentDocument({id: addingDocumentId, initialCursorPosition: State.Start}),
          ),
        )
      }

    | _ => ()
    }

  | Action.DeleteDocument({nextCurrentId, initialCursorPosition}) =>
    switch state->State.DocumentPane.current {
    | Some(currentDocument) =>
      switch state->State.DocumentPane.currentRootDocumentItem {
      | Some({id: rootItemId, firstChildId}) =>
        switch state->State.DocumentItemPane.get(firstChildId) {
        | Some({id: firstChildItemId}) =>
          open Firebase.Firestore

          let {id, parentId, prevId, nextId} = currentDocument

          let db = Firebase.firestore()
          let batch = db->batch
          let documents = db->collection("documents")
          let items = db->collection("items")

          batch->addDelete(documents->doc(id))
          batch->addDelete(items->doc(rootItemId))
          batch->addDelete(items->doc(firstChildItemId))

          if prevId == "" {
            if parentId != "" {
              batch->addUpdate(documents->doc(parentId), {"firstChildId": nextId})
            }
          } else {
            batch->addUpdate(documents->doc(prevId), {"nextId": nextId})
          }

          if nextId == "" {
            if parentId != "" {
              batch->addUpdate(documents->doc(parentId), {"lastChildId": prevId})
            }
          } else {
            batch->addUpdate(documents->doc(nextId), {"prevId": prevId})
          }

          Reductive.Store.dispatch(
            store,
            Action.DocumentPane(
              Action.SetCurrentDocument({
                id: nextCurrentId,
                initialCursorPosition: initialCursorPosition,
              }),
            ),
          )

          batch->commit

        | None => ()
        }

      | None => ()
      }

    | _ => ()
    }
  }
}
