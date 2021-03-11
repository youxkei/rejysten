type rec item = Item({
    id: string,
    text: string,
    subitems: array<item>,
})

@react.component
let make = (~item) => {
    let Item({text}) = item

    <span>{text->React.string}</span>
}
