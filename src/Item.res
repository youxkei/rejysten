type rec item = Item({
    id: string,
    text: string,

    parent: string,
    prev: string,
    next: string,
    firstSubitem: string,
})

@react.component
let make = (~item) => {
    let Item({text}) = item

    <span>{text->React.string}</span>
}
