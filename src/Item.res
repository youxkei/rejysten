@react.component
let make = React.memo((~item: State.item) => {
  <ReactMarkdown remarkPlugins={[ReactMarkdown.gfm, ReactMarkdown.highlight]}>
    {item.text}
  </ReactMarkdown>
})

React.setDisplayName(make, "Item")
