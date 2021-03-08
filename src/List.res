
type rec item = Item({
    id: string,
    text: string,
    subitems: array<item>,
})

module type ItemType = {
	let make: ({"item": item}) => ReasonReact.reactElement;
	let makeProps: (~item: 'item, ~key: string=?, unit) => {"item": 'item};
};

module rec Item: ItemType = {
    @react.component
    let make = (~item) => {
        let Item({text, subitems}) = item
        <>
            <li><textarea defaultValue={text} /></li>
            <ul>
                {subitems->Belt.Array.map(item => {
                    let Item({id}) = item
                    <Item item key={id} />
                })->React.array}
            </ul>
        </>
    }
}

@react.component
let make = (~items) => {
    <ul>
        {items->Belt.Array.map(item => {
            let Item({id}) = item
            <Item item key={id} />
        })->React.array}
    </ul>
}
