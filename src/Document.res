open Belt

@bs.module("firebase/app") external firebase: 'any = "default"
@bs.module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

let makeItemsMap = items => {
    let itemsMap = HashMap.String.make(~hintSize=10)
    let rootItem = ref(None)

    items->Array.forEach(item => {
        let id = item["id"]
        let text = item["text"]
        let next = item["next"]
        let prev = item["prev"]
        let parent = item["parent"]
        let firstSubitem = item["firstSubitem"]
        let item = Item.Item({ id, text, next, prev, parent, firstSubitem })

        itemsMap->HashMap.String.set(id, item)

        if parent == "" {
            rootItem.contents = Some(item)
        }
    })

    (itemsMap, Option.getExn(rootItem.contents))
}

@react.component
let make = (~document) => {
    let (items, loading, error) = useCollectionData(firebase["firestore"]()["collection"]("items")["where"]("document", "==", document), { "idField": "id" })

    switch error {
        | Some(error) => <span>{error["toString"]()->React.string}</span>
        | None => if loading {
            <span>loading</span>
        } else {
            let (itemsMap, item) = makeItemsMap(items)

            <Items itemsMap item />
        }
    }
}
