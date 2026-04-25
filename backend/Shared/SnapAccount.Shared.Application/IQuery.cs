using MediatR;
using SnapAccount.Shared.Domain;

namespace SnapAccount.Shared.Application;

public interface IQuery<TResponse> : IRequest<Result<TResponse>>
{
}
