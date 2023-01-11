import {
  ErrorMessage,
  FieldProps as RawFieldProps,
  Formik,
  FormikConfig,
  FormikValues,
  useFormikContext,
} from "formik";
import {
  LabelHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  useRef,
  useEffect,
  Key,
} from "react";
import { OmitStrict, ReadonlyRecord } from "readonly-types";
import { usePrevious } from "ahooks";
import { focusAndScrollIntoViewIfRequired } from "oaf-side-effects";
import type { ReadonlyDeep } from "type-fest";

export type FieldProps<
  V = FormValue,
  FormValues = ReadonlyRecord<string, unknown>,
> = ReadonlyDeep<RawFieldProps<V, FormValues>>;

export type LabelProps = OmitStrict<
  LabelHTMLAttributes<HTMLLabelElement>,
  "htmlFor" // We omit htmlFor because we hook it up ourselves based on the input ID and don't want to encourage/enable/allow broken accessibility
>;

export type FormValue = InputHTMLAttributes<unknown>["value"];

export type InputProps<
  V = FormValue,
  FormValues extends ReadonlyRecord<string, unknown> = ReadonlyRecord<
    string,
    unknown
  >,
> = {
  readonly fieldProps: FieldProps<V, FormValues>;
  readonly label: string | JSX.Element;
  readonly labelProps?: LabelProps;
  // TODO exclude name? And anything else? Everything from formik's FieldInputProps?
  readonly inputProps?: InputHTMLAttributes<HTMLInputElement>;
};

/**
 * Focus the first invalid form element in a form after a failed form submission.
 * @see https://stackoverflow.com/a/67706127/2476884 for the inspiration
 * @see https://webaim.org/techniques/formvalidation/ for accessibility considerations
 */
export const useFocusInvalidField = <
  T extends HTMLElement,
  U extends HTMLElement,
>(
  name: string,
  smoothScroll = false,
) => {
  const formikContext = useFormikContext();
  // The input/select itself, this is what we will be focusing.
  const fieldRef = useRef<T>(null);
  // The container element that contains both the input/select and its label.
  // This is what we will be scrolling into view. Doing this helps guarantee that
  // the label will be visible. If the submit button is at the bottom of the form and the
  // label is above the invalid input, _just_ focusing the input could leave the
  // label offscreen (above the viewport) which can make it difficult for the user to
  // identify the invalid field.
  const containerElementRef = useRef<U>(null);

  // Use the _previous_ state of `isSubmitting` to determine when the form was submitting but now no longer is.
  // This gives Formik a chance to run validation one last time before we move focus.
  // If we didn't do this we could prematurely move focus to a field that was previously invalid (the last time
  // it was validated) but has since been updated to a value that will be considered valid the next time validation runs.
  const wasSubmitting = usePrevious(formikContext.isSubmitting);

  useEffect(() => {
    const firstError = Object.keys(formikContext.errors)[0];
    if (
      wasSubmitting === true &&
      !formikContext.isSubmitting &&
      firstError === name &&
      fieldRef.current !== null
    ) {
      // Use a helper function from https://github.com/oaf-project/oaf-side-effects.
      // This does some browser compatibility and accessibility work for us.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      focusAndScrollIntoViewIfRequired(
        fieldRef.current, // focus the input/select
        containerElementRef.current ?? fieldRef.current, // scroll the container (and label) into view if set, otherwise scroll to the input
        smoothScroll, // optionally use smooth scroll. Accessibility note: this will ignore smooth scroll if the user has indicated a preference for reduced motion.
      );
    }
  }, [
    wasSubmitting,
    formikContext.isSubmitting,
    name,
    formikContext.errors,
    smoothScroll,
  ]);
  return { fieldRef, containerElementRef };
};

/**
 * A Formik `ErrorMessage` styled as a Bootstrap `invalid-feedback`.
 *
 * @see https://formik.org/docs/api/errormessage
 * @see https://getbootstrap.com/docs/5.0/forms/validation/
 */
export const BootstrapErrorMessage = (props: {
  readonly name: string;
  readonly id: string;
}) => (
  <ErrorMessage name={props.name}>
    {(errorMessage) => (
      <div className="invalid-feedback" id={props.id}>
        {errorMessage}
      </div>
    )}
  </ErrorMessage>
);

/**
 * Usage:
 *
 *  <Field name="givenName">
 *    {(fieldProps: FieldProps) => (
 *      <BootstrapInput
 *        label="Your Given Name"
 *        fieldProps={fieldProps}
 *        inputProps={{ placeholder: "Jane" }}
 *      />
 *    )}
 *  </Field>
 */
export const BootstrapInput: React.ComponentType<InputProps> = (
  props: InputProps,
) => {
  const name = props.fieldProps.field.name;
  // Good accessibility practice to move focus to the first invalid field in a form after form submission.
  // see https://webaim.org/techniques/formvalidation/
  const { fieldRef, containerElementRef } = useFocusInvalidField<
    HTMLInputElement,
    HTMLLabelElement
  >(name);
  const id = props.inputProps?.id ?? name;
  const isInvalid = props.fieldProps.meta.error !== undefined;
  const isSubmitted = props.fieldProps.form.submitCount > 0;

  // TODO: make the derivation of feedback ID configurable
  const invalidFeedbackId = `${id}-feedback`;

  const isCheckboxOrRadio =
    props.inputProps?.type === "checkbox" || props.inputProps?.type === "radio";

  const validationClass = isSubmitted
    ? isInvalid
      ? " is-invalid"
      : " is-valid"
    : "";

  return (
    <>
      <label
        ref={containerElementRef}
        className={isCheckboxOrRadio ? "form-check-label" : "form-label"}
        {...props.labelProps}
        htmlFor={id}
      >
        {props.label}
      </label>
      <input
        ref={fieldRef}
        className={
          (isCheckboxOrRadio ? "form-check-input" : "form-control") +
          validationClass
        }
        {...props.fieldProps.field}
        {...props.inputProps}
        id={id}
        value={props.fieldProps.field.value ?? ""}
        // 'To stop form controls from announcing as invalid by default, one can add aria-invalid="false" to any necessary element.'
        // See https://www.tpgi.com/required-attribute-requirements/
        aria-invalid={isInvalid}
        // See https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA1#example-2-using-aria-describedby-to-associate-instructions-with-form-fields
        aria-describedby={isInvalid ? invalidFeedbackId : undefined}
      ></input>
      <BootstrapErrorMessage name={name} id={invalidFeedbackId} />
    </>
  );
};

export type SelectOption<A extends string> = {
  // Union with empty string to allow default empty value as first select option.
  readonly value: A | "";
  readonly label: string;
  readonly disabled?: boolean;
  // https://reactjs.org/docs/lists-and-keys.html#keys
  readonly key?: Key;
};

export type SelectOptionGroup<A extends string> = {
  readonly label?: string;
  readonly disabled?: boolean;
  readonly options: ReadonlyArray<SelectOption<A>>;
  // https://reactjs.org/docs/lists-and-keys.html#keys
  readonly key?: Key;
};

type SelectOptionOrGroup<A extends string> =
  | SelectOptionGroup<A>
  | SelectOption<A>;

const isSelectOption = <A extends string>(
  o: SelectOptionOrGroup<A>,
): o is SelectOption<A> =>
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/consistent-type-assertions
  (o as SelectOption<A>).label !== undefined &&
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/consistent-type-assertions
  (o as SelectOption<A>).value !== undefined;

export type SelectOptions<A extends string> = ReadonlyArray<
  SelectOptionOrGroup<A>
>;

export const RenderOptions = <A extends string>({
  options,
}: {
  readonly options: SelectOptions<A>;
}): JSX.Element => (
  <>
    {options.map((o) =>
      isSelectOption(o) ? (
        <option key={o.key} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ) : (
        <optgroup key={o.key} label={o.label} disabled={o.disabled}>
          <RenderOptions options={o.options} />
        </optgroup>
      ),
    )}
  </>
);

export type BootstrapOptions = {
  // TODO port floatingLabel to BootstrapInput
  readonly floatingLabel?: boolean;
};

export type SelectProps<
  V = FormValue,
  FormValues = ReadonlyRecord<string, unknown>,
> = {
  readonly fieldProps: FieldProps<V, FormValues>;
  readonly label: string | JSX.Element;
  readonly labelProps?: LabelProps;
  // TODO exclude name? And anything else? Everything from formik's FieldInputProps?
  readonly inputProps?: SelectHTMLAttributes<HTMLSelectElement>;
  readonly options?: SelectOptions<string>;
  readonly bootstrapOptions?: BootstrapOptions;
};

export const BootstrapSelect: React.ComponentType<SelectProps> = (
  props: SelectProps,
) => {
  const name = props.fieldProps.field.name;
  // Good accessibility practice to move focus to the first invalid field in a form after form submission.
  // see https://webaim.org/techniques/formvalidation/
  const { fieldRef, containerElementRef } = useFocusInvalidField<
    HTMLSelectElement,
    HTMLDivElement
  >(name);
  const id = props.inputProps?.id ?? name;
  const isInvalid = props.fieldProps.meta.error !== undefined;
  const isSubmitted = props.fieldProps.form.submitCount > 0;

  // TODO: make the derivation of feedback ID configurable
  const invalidFeedbackId = `${id}-feedback`;

  const validationClass = isSubmitted
    ? isInvalid
      ? " is-invalid"
      : " is-valid"
    : "";

  const isFloatingLabel = props.bootstrapOptions?.floatingLabel ?? false;

  const label = (
    <label className="form-label" {...props.labelProps} htmlFor={id}>
      {props.label}
    </label>
  );

  return (
    <div
      ref={containerElementRef}
      className={isFloatingLabel ? "form-floating" : undefined}
    >
      {!isFloatingLabel ? label : undefined}
      <select
        ref={fieldRef}
        className={"form-select" + validationClass}
        {...props.fieldProps.field}
        {...props.inputProps}
        id={id}
        value={props.fieldProps.field.value ?? ""}
        // 'To stop form controls from announcing as invalid by default, one can add aria-invalid="false" to any necessary element.'
        // See https://www.tpgi.com/required-attribute-requirements/
        aria-invalid={isInvalid}
        // See https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA1#example-2-using-aria-describedby-to-associate-instructions-with-form-fields
        aria-describedby={isInvalid ? invalidFeedbackId : undefined}
      >
        <RenderOptions options={props.options ?? []} />
      </select>
      {/* Bootstrap floating labels have to come after the input. See https://getbootstrap.com/docs/5.0/forms/floating-labels/ */}
      {isFloatingLabel ? label : undefined}
      {isInvalid ? (
        <BootstrapErrorMessage name={name} id={invalidFeedbackId} />
      ) : undefined}
    </div>
  );
};

export const Form = <Values extends FormikValues>(
  props: FormikConfig<Values>,
) => {
  const { children, ...formikProps } = props;
  return (
    <Formik<Values>
      {...formikProps}
      // Better accessibility if we wait until blur to validate.
      // See e.g. https://www.tpgi.com/required-attribute-requirements/
      validateOnChange={false}
    >
      {(renderProps): JSX.Element => (
        <form
          onSubmit={renderProps.handleSubmit}
          // Better accessibility if we do our own inline validation.
          // See:
          // https://www.tpgi.com/required-attribute-requirements/
          // https://github.com/w3c/wcag/issues/961
          // https://design-system.service.gov.uk/patterns/validation/#turn-off-html5-validation
          // https://oliverjam.es/articles/better-native-form-validation#native-isnt-always-better
          // https://adrianroselli.com/2019/02/avoid-default-field-validation.html
          // Doing this allows us to set the `required` attribute on inputs (for
          // the semantics!) without fear of triggering native (bad) validation.
          noValidate={true}
        >
          {typeof children === "function" ? children(renderProps) : children}
        </form>
      )}
    </Formik>
  );
};
