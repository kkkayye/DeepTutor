from __future__ import annotations

import json

from llama_index.core.schema import TextNode, NodeWithScore

from socartes.services.rag.pipelines.llamaindex import storage


def _write_docstore(storage_dir, entries: dict[str, tuple[str, dict[str, str]]]) -> None:
    storage_dir.mkdir(parents=True)
    data = {}
    for node_id, (text, relationships) in entries.items():
        data[node_id] = {
            "__data__": {
                "id_": node_id,
                "text": text,
                "metadata": {"file_name": "story.docx"},
                "relationships": {
                    key: {"node_id": rel_id, "node_type": "1"}
                    for key, rel_id in relationships.items()
                },
            }
        }
    (storage_dir / "docstore.json").write_text(
        json.dumps({"docstore/data": data}), encoding="utf-8"
    )


def test_augment_retrieved_nodes_adds_lexical_match_and_adjacent_answer(tmp_path):
    storage_dir = tmp_path / "index"
    _write_docstore(
        storage_dir,
        {
            "setup": (
                "Jenkins says the narrator planned to send Paloma perfectos, "
                "but an error happened with the shipping clerk.",
                {"3": "answer"},
            ),
            "answer": (
                "They sent him a dozen boxes of Hickey's Pride instead.",
                {"2": "setup"},
            ),
            "distractor": ("The pajamas were bright red silk.", {}),
        },
    )
    vector_nodes = [
        NodeWithScore(node=TextNode(text="The pajamas were bright red silk.", id_="distractor"))
    ]

    nodes = storage.augment_retrieved_nodes(
        storage_dir,
        "Which cheap cigar brand was sent by mistake instead of Paloma perfectos?",
        vector_nodes,
        lexical_top_k=1,
        adjacent_hops=1,
    )

    texts = [node.node.text for node in nodes]
    assert texts[0].startswith("Jenkins says the narrator planned")
    assert "Hickey's Pride" in texts[1]
    assert texts[-1] == "The pajamas were bright red silk."


def test_augment_retrieved_nodes_adds_direct_named_entity_match(tmp_path):
    storage_dir = tmp_path / "index"
    _write_docstore(
        storage_dir,
        {
            "label": (
                "The box was marked Roland Mastermann, Government House, "
                "Hong Kong, China.",
                {},
            ),
            "distractor": ("Jenkins searched the writing desk.", {}),
        },
    )

    nodes = storage.augment_retrieved_nodes(
        storage_dir,
        "What name and address were printed on the package box?",
        [],
        lexical_top_k=2,
        adjacent_hops=1,
    )

    assert len(nodes) == 1
    assert "Roland Mastermann" in nodes[0].node.text


def test_augment_retrieved_nodes_retrieves_each_numbered_subquestion(tmp_path):
    storage_dir = tmp_path / "index"
    _write_docstore(
        storage_dir,
        {
            "sender": (
                "The box was marked Roland Mastermann, Government House, Hong Kong, China.",
                {},
            ),
            "cigars": (
                "They sent him a dozen boxes of Hickey's Pride instead. Jenkins said "
                "a twofer meant two for five.",
                {},
            ),
            "pajamas": (
                "After untying the string, the narrator exclaimed that it was a "
                "suit of pajamas. Later, a little spider dropped into a fold.",
                {},
            ),
        },
    )

    nodes = storage.augment_retrieved_nodes(
        storage_dir,
        "\n".join(
            [
                "Use only the selected course database.",
                "Q01: What name and address were printed on the package box?",
                "Q05: Which cheap cigar brand was sent by mistake instead of Paloma perfectos?",
                "Q06: What did Jenkins say a twofer meant?",
                "Q07: What was the gift after the string was untied?",
                "Q09: What dropped into a fold of the pajamas?",
            ]
        ),
        [],
        lexical_top_k=1,
        adjacent_hops=0,
    )

    full_text = "\n".join(node.node.text for node in nodes)
    assert "Roland Mastermann" in full_text
    assert "Hickey's Pride" in full_text
    assert "two for five" in full_text
    assert "suit of pajamas" in full_text
    assert "little spider" in full_text
