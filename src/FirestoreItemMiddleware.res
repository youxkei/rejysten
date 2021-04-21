open Belt
let get = HashMap.String.get
let size = HashMap.String.size

@module("uuid") external uuidv4: unit => string = "v4"

let middleware = (store, action: Action.firestore_item_action) => {
  switch action {
  | Action.Save => {
      let {mode, documentItems: {currentId, map, editingText}}: State.t = Reductive.Store.getState(
        store,
      )

      switch map->get(currentId) {
      | Some({id}) =>
        switch mode {
        | State.Insert(_) => {
            open Firebase.Firestore

            Firebase.firestore()->collection("items")->doc(id)->update({"text": editingText})
          }

        | _ => ()
        }

      | _ => ()
      }
    }

  | Action.Indent => {
      let {mode, documentItems: {currentId, map, editingText}}: State.t = Reductive.Store.getState(
        store,
      )

      switch map->get(currentId) {
      | Some({id, parentId, prevId, nextId}) =>
        open Firebase.Firestore

        let db = Firebase.firestore()
        let batch = db->batch
        let items = db->collection("items")

        switch mode {
        | State.Insert(_) => batch->addUpdate(items->doc(id), {"text": editingText})

        | _ => ()
        }

        switch map->get(prevId) {
        | Some({lastChildId: prevLastChildId}) => {
            if prevLastChildId == "" {
              batch->addUpdate(items->doc(id), {"parentId": prevId, "prevId": "", "nextId": ""})
              batch->addUpdate(
                items->doc(prevId),
                {"nextId": nextId, "firstChildId": id, "lastChildId": id},
              )
            } else {
              batch->addUpdate(
                items->doc(id),
                {"parentId": prevId, "prevId": prevLastChildId, "nextId": ""},
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
          }

        | _ => ()
        }

        batch->commit

      | _ => ()
      }
    }

  | Action.Unindent => {
      let {mode, documentItems: {currentId, map, editingText}}: State.t = Reductive.Store.getState(
        store,
      )

      switch map->get(currentId) {
      | Some({id, parentId, prevId, nextId}) =>
        open Firebase.Firestore

        let db = Firebase.firestore()
        let batch = db->batch
        let items = db->collection("items")

        switch mode {
        | State.Insert(_) => batch->addUpdate(items->doc(id), {"text": editingText})

        | _ => ()
        }

        switch map->get(parentId) {
        | Some({parentId: parentParentId, nextId: parentNextId}) =>
          if parentParentId != "" {
            batch->addUpdate(
              items->doc(id),
              {
                "parentId": parentParentId,
                "prevId": parentId,
                "nextId": parentNextId,
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
          }

        | _ => ()
        }

        batch->commit

      | _ => ()
      }
    }

  | Action.Add({direction}) => {
      let {
        mode,
        documentItems: {currentId, map, editingText},
        documents: {currentId: currentDocumentId},
      }: State.t = Reductive.Store.getState(store)

      switch map->get(currentId) {
      | Some({id, parentId, prevId, nextId}) => {
          open Firebase.Firestore

          let db = Firebase.firestore()
          let batch = db->batch
          let items = db->collection("items")

          let addingItemId = uuidv4()

          switch mode {
          | State.Insert(_) => batch->addUpdate(items->doc(id), {"text": editingText})

          | _ => ()
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

          Reductive.Store.dispatch(
            store,
            Action.SetCurrentDocumentItem({id: addingItemId, initialCursorPosition: State.Start}),
          )
        }

      | _ => ()
      }
    }

  | Action.Delete => {
      let {documentItems: {currentId, map}}: State.t = Reductive.Store.getState(
        store,
      )

      switch map->get(currentId) {
      | Some(item) => {
          open Firebase.Firestore

          let {id, parentId, prevId, nextId} = item

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
        }

      | _ => ()
      }
    }
  }
}
