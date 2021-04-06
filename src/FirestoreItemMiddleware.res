open Belt

@module("uuid") external uuidv4: unit => string = "v4"

let middleware = (store, action: Action.firestore_item_action) => {
  switch action {
  | Action.Save({text}) => {
      let {
        documentItems: {currentId: currentDocumentItemId, map: documentItemMap},
      }: State.t = Reductive.Store.getState(store)

      switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
      | Some({id}) => {
          open Firebase.Firestore

          Firebase.firestore()->collection("items")->doc(id)->update({"text": text})
          Reductive.Store.dispatch(store, Action.InsertMode(ToNormalMode))
        }
      | _ => ()
      }
    }

  | Action.Indent({text}) => {
      let {
        documentItems: {currentId: currentDocumentItemId, map: documentItemMap},
      }: State.t = Reductive.Store.getState(store)

      switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
      | Some({id, parentId, prevId, nextId}) =>
        switch documentItemMap->HashMap.String.get(prevId) {
        | Some({lastChildId: prevLastChildId}) => {
            open Firebase.Firestore

            let db = Firebase.firestore()
            let batch = db->batch
            let items = db->collection("items")

            if prevLastChildId == "" {
              batch->addUpdate(
                items->doc(id),
                {"parentId": prevId, "prevId": "", "nextId": "", "text": text},
              )
              batch->addUpdate(
                items->doc(prevId),
                {"nextId": nextId, "firstChildId": id, "lastChildId": id},
              )
            } else {
              batch->addUpdate(
                items->doc(id),
                {"parentId": prevId, "prevId": prevLastChildId, "nextId": "", "text": text},
              )
              batch->addUpdate(items->doc(prevId), {"nextId": nextId, "lastChildId": id})
              batch->addUpdate(items->doc(prevLastChildId), {"nextId": id})
            }

            if nextId == "" {
              if parentId != "" {
                batch->addUpdate(items->doc(parentId), {"lastChildId": prevId})
              }
            } else {
              batch->addUpdate(items->doc(nextId), {"prevId": prevId})
            }

            batch->commit
          }

        | _ => ()
        }

      | _ => ()
      }
    }

  | Action.Unindent({text}) => {
      let {
        documentItems: {currentId: currentDocumentItemId, map: documentItemMap},
      }: State.t = Reductive.Store.getState(store)

      switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
      | Some({id, parentId, prevId, nextId}) =>
        switch documentItemMap->HashMap.String.get(parentId) {
        | Some({parentId: parentParentId, nextId: parentNextId}) =>
          if parentParentId != "" {
            open Firebase.Firestore

            let db = Firebase.firestore()
            let batch = db->batch
            let items = db->collection("items")

            batch->addUpdate(
              items->doc(id),
              {
                "parentId": parentParentId,
                "prevId": parentId,
                "nextId": parentNextId,
                "text": text,
              },
            )
            batch->addUpdate(items->doc(parentId), {"nextId": id})

            if nextId == "" {
              batch->addUpdate(items->doc(parentId), {"lastChildId": prevId})
            } else {
              batch->addUpdate(items->doc(nextId), {"prevId": prevId})
            }

            if prevId == "" {
              batch->addUpdate(items->doc(parentId), {"firstChildId": nextId})
            } else {
              batch->addUpdate(items->doc(prevId), {"nextId": nextId})
            }

            if parentNextId == "" {
              if parentParentId != "" {
                batch->addUpdate(items->doc(parentParentId), {"lastChildId": id})
              }
            } else {
              batch->addUpdate(items->doc(parentNextId), {"prevId": id})
            }

            batch->commit
          }

        | _ => ()
        }

      | _ => ()
      }
    }

  | Action.Add({text, direction}) => {
      let {
        documentItems: {currentId: currentDocumentItemId, map: documentItemMap},
        documents: {currentId: currentDocumentId},
      }: State.t = Reductive.Store.getState(store)

      switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
      | Some({id, parentId, prevId, nextId}) => {
          open Firebase.Firestore

          let db = Firebase.firestore()
          let batch = db->batch
          let items = db->collection("items")

          let addingItemId = uuidv4()

          switch text {
          | Some(text) => batch->addUpdate(items->doc(id), {"text": text})

          | None => ()
          }

          switch direction {
          | Action.Prev => {
              batch->addUpdate(items->doc(id), {"prevId": addingItemId})

              batch->addSet(
                items->doc(addingItemId),
                {
                  "documentId": currentDocumentId,
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
                  batch->addUpdate(items->doc(parentId), {"firstChildId": addingItemId})
                }
              } else {
                batch->addUpdate(items->doc(prevId), {"nextId": addingItemId})
              }
            }

          | Action.Next => {
              batch->addUpdate(items->doc(id), {"nextId": addingItemId})

              batch->addSet(
                items->doc(addingItemId),
                {
                  "documentId": currentDocumentId,
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
                  batch->addUpdate(items->doc(parentId), {"lastChildId": addingItemId})
                }
              } else {
                batch->addUpdate(items->doc(nextId), {"prevId": addingItemId})
              }
            }
          }

          batch->commit

          Reductive.Store.dispatch(store, SetCurrentDocumentItem({id: addingItemId}))
        }

      | _ => ()
      }
    }

  | Action.Delete => {
      let {
        documentItems: {currentId: currentDocumentItemId, map: documentItemMap},
      }: State.t = Reductive.Store.getState(store)

      switch documentItemMap->HashMap.String.get(currentDocumentItemId) {
      | Some({id, parentId, prevId, nextId}) => {
          open Firebase.Firestore

          let db = Firebase.firestore()
          let batch = db->batch
          let items = db->collection("items")

          batch->addDelete(items->doc(id))

          if prevId == "" {
            if parentId != "" {
              batch->addUpdate(items->doc(parentId), {"firstChildId": nextId})
            }
          } else {
            batch->addUpdate(items->doc(prevId), {"nextId": nextId})
          }

          if nextId == "" {
            if parentId != "" {
              batch->addUpdate(items->doc(parentId), {"lastChildId": prevId})
            }
          } else {
            batch->addUpdate(items->doc(nextId), {"prevId": prevId})
          }

          batch->commit

          if prevId == "" {
            if parentId != "" {
              Reductive.Store.dispatch(store, SetCurrentDocumentItem({id: parentId}))
            }
          } else {
            Reductive.Store.dispatch(store, SetCurrentDocumentItem({id: prevId}))
          }
        }

      | _ => ()
      }
    }
  }
}
