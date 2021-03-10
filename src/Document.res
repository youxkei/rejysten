open Belt

@bs.module("firebase/app") external firebase: 'any = "default"
@bs.module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

let rec makeItems = (items, level, children) => {
    switch level {
        | -1 => children->Map.String.getExn("")

        | _ => {
            let children = items->Array.reduce(
                children,
                (accumulated, item) => {
                    if item["level"] == level {
                        let id = item["id"]

                        let addingItem = Item.Item({
                            id: id,
                            text: item["text"],
                            subitems: accumulated->Map.String.getWithDefault(id, []),
                        })

                        let parent = item["parent"]

                        accumulated->Map.String.set(
                            parent,
                            Array.concat(
                                accumulated->Map.String.getWithDefault(parent, []),
                                [addingItem]
                            )
                        )
                    } else {
                        accumulated
                    }
                }
            )

            makeItems(items, level - 1, children)
        }
    }
}

@react.component
let make = (~document) => {
    let (items, loading, error) = useCollectionData(firebase["firestore"]()["collection"]("items")["where"]("document", "==", document), { "idField": "id" })

    switch error {
        | Some(error) => <span>{error["toString"]()->React.string}</span>
        | None => if loading {
            <span>loading</span>
        } else {
            let maxLevel = items->Array.reduce(
                0,
                (accumulated, item) => if item["level"] > accumulated {
                    item["level"]
                } else {
                    accumulated
                }
            )

            let items = makeItems(items, maxLevel, Map.String.empty)

            <Items items />
        }
    }
}
