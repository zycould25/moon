import { forwardRef } from "react";

export const ReaderContainer = forwardRef<HTMLDivElement>(
  function ReaderContainer(_props, ref) {
    return (
      <div className="reader-stage">
        <div
          ref={ref}
          className="w-full h-full"
          style={{ minHeight: 0 }}
        />
      </div>
    );
  },
);
