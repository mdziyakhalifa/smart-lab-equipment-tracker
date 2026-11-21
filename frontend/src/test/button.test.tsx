import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders children and has button role", () => {
    render(<Button>Save record</Button>);
    const button = screen.getByRole("button", { name: /save record/i });
    expect(button).toBeInTheDocument();
  });

  it("applies the variant class", () => {
    render(<Button variant="destructive">Delete</Button>);
    const button = screen.getByRole("button", { name: /delete/i });
    expect(button).toHaveClass("bg-destructive");
  });
});
