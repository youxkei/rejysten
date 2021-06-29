@module("react-firebase-hooks/firestore") external useCollectionData: 'any = "useCollectionData"

%%private(
  let searchItems = (items: array<State.item>, searchingText) => {
    items->Belt.Array.keep(item => {
      item.id->Js.String2.includes(searchingText)
    })
  }
)

@react.component
let make = () => {
  let dispatch = Redux.useDispatch()
  let items = Redux.useSelector(State.Firestore.items)
  let searchingText = Redux.useSelector(State.SearchPane.searchingText)

  dispatch(Action.SetSearchPaneState({items: searchItems(items, searchingText)}))

  React.null
}
