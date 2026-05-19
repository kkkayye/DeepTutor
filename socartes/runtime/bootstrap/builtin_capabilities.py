"""Built-in capability class paths."""

BUILTIN_CAPABILITY_CLASSES: dict[str, str] = {
    "chat": "socartes.capabilities.chat:ChatCapability",
    "deep_solve": "socartes.capabilities.deep_solve:DeepSolveCapability",
    "deep_question": "socartes.capabilities.deep_question:DeepQuestionCapability",
    "deep_research": "socartes.capabilities.deep_research:DeepResearchCapability",
    "math_animator": "socartes.capabilities.math_animator:MathAnimatorCapability",
    "visualize": "socartes.capabilities.visualize:VisualizeCapability",
}
