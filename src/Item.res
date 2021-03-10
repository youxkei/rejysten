@bs.module("firebase/app") external firebase: 'any = "default"

type rec item = Item({
    id: string,
    text: string,
    subitems: array<item>,
})

@react.component
let make = (~item) => {
    let Item({id, text}) = item

    let handleChange = event => {
        firebase["firestore"]()["collection"]("items")["doc"](id)["update"]({ "text": ReactEvent.Form.target(event)["value"] })
    }

    <textarea defaultValue=text onChange=handleChange />
}
